'use strict';

const path = require('path');
const _ = require('lodash');
const { Pool } = require('pg');
const bigal = require('bigal');
const { MongoClient } = require('mongodb');
const yaml = require('js-yaml');
const fs = require('mz/fs');
const argv = require('yargs')
    .usage('Usage: $0 [options]')
    .example('$0 -c ./collections.yaml -m mongodb://localhost/source_db -s postgres://localhost/dest_db', 'Migrate collections defined in collections.yaml from source_db to dest_db')
    .alias('c', 'config')
    .nargs('c', 1)
    .describe('c', 'Collections config file')
    .alias('m', 'mongo')
    .nargs('m', 1)
    .describe('m', 'Mongo connection string')
    .alias('s', 'sql')
    .nargs('s', 1)
    .describe('s', 'Postgres connection string')
    .boolean('v')
    .describe('v', 'Verbose logging')
    .demandOption(['c', 'm', 's'])
    .help('h')
    .alias('h', 'help')
    .argv;

const batchSize = 1000;

(async function main() {

  if (argv.v) {
    console.log(`MongoDB: ${argv.mongo}`);
    console.log(`sqlDB:   ${argv.sql}`);
  }

  // region Setup pg
  const sqlDb = new Pool({
    connectionString: argv.sql,
  });

  console.time('Setup BigAl orm...');

  const modelsPath = path.join(__dirname, 'models');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const files = await fs.readdir(modelsPath);
  const modelSchemas = files.filter((file) => /.js$/ig.test(file)).map((file) => {
    const fileBasename = path.basename(file, '.js');
    /* eslint-disable global-require, import/no-dynamic-require */
    const schema = require(`${modelsPath}/${fileBasename}`);
    /* eslint-enable global-require, import/no-dynamic-require */

    return _.merge({
      globalId: fileBasename,
      tableName: fileBasename.toLowerCase(),
    }, schema);
  });

  const modelsByTableName = {};
  await bigal.initialize({
    modelSchemas,
    pool: sqlDb,
    readonlyPool: sqlDb,
    expose(model, modelSchema) {
      global[modelSchema.globalId] = model;
      modelsByTableName[modelSchema.tableName || modelSchema.globalId] = model;
    },
  });

  console.timeEnd('Setup BigAl orm...');

  // endregion

  // region Setup mongo
  const mongoClient = await MongoClient.connect(argv.mongo);
  const mongoDb = mongoClient.db(mongoClient.databaseName);

  // endregion

  const ymlContent = await fs.readFile(argv.config, 'utf-8');
  var doc = yaml.safeLoad(ymlContent);

  for (const [dbConfig, dbConfigValues] of Object.entries(doc)) {
    console.log(dbConfig);
    for (const [collectionName, collectionSettings] of Object.entries(dbConfigValues)) {
      const sqlTable = collectionSettings[':meta'][':table'];
      console.log(`\tProcessing ${collectionName} => ${sqlTable}...`);

      const model = modelsByTableName[sqlTable];

      const fieldsBySqlColumn = {};
      for (const [name, value] of Object.entries(model._schema.attributes)) {
        fieldsBySqlColumn[value.columnName || name] = name;
      }

      const sqlColumnsByMongoColumn = {};
      const dataShapingBySqlColumn = {};
      for (const column of collectionSettings[':columns']) {
        let sqlColumn;
        let mongoColumn;
        let type;
        for (const [key, value] of Object.entries(column)) {
          switch (key) {
            case ':type':
              type = value;
              break;
            case ':source':
              mongoColumn = value;
              break;
            default:
              sqlColumn = key;
              if (!_.isNull(value) && !type) {
                type = value;
              }
              break;
          }
        }

        if (!sqlColumn) {
          throw new Error(`Unable to determine mapping details: ${JSON.stringify(column)}`)
        }

        sqlColumnsByMongoColumn[mongoColumn || sqlColumn] = sqlColumn;

        if (type.toUpperCase() === 'TEXT') {
            dataShapingBySqlColumn[sqlColumn] = (val) => {
              if (_.isNil(val)) {
                return val;
              }

              if (_.isString(val)) {
                return val;
              }

              return String(val);
            };
        }
      }

      // Gut check the mappings
      if (argv.v) {
        for (const [mongo, sql] of Object.entries(sqlColumnsByMongoColumn)) {
          console.log(`\t\t${mongo}=>${fieldsBySqlColumn[sql]}(sql: ${sql})`);
        }
      }

      const collection = mongoDb.collection(collectionName);

      if (!model) {
        throw new Error(`Unable to find model with tableName=${sqlTable}`);
      }

      console.time(`${sqlTable} - total time`);

      const queryProjection = {
        _id: true,
      };
      for (const mongoColumn of _.keys(sqlColumnsByMongoColumn)) {
        queryProjection[mongoColumn] = true;
      }

      if (argv.v) {
        console.log('\t\tMongo query projection:');
        console.log(JSON.stringify(queryProjection, null, 2));
      }

      let count = 0;
      let records;
      while (!records || records.length) {
        const startCount = count + batchSize;
        console.time(`${sqlTable} - ${startCount}`);

        records = await collection.find({
          pgReplicated: null,
        }).limit(batchSize).toArray();

        await model.create(records.map((record) => {
          const objectToInsert = {};
          for (const [field, value] of Object.entries(record)) {
            if (queryProjection[field]) {
              const sqlColumn = sqlColumnsByMongoColumn[field];
              const bigalField = fieldsBySqlColumn[sqlColumn];
              if (!model._schema.attributes[bigalField]) {
                throw new Error(`Unable to find field in schema: ${field}`);
              }

              objectToInsert[bigalField] = value;
              if (dataShapingBySqlColumn[sqlColumn]) {
                objectToInsert[bigalField] = dataShapingBySqlColumn[sqlColumn](value);
              } else if (model._schema.attributes[bigalField].type === 'boolean' && !value) {
                objectToInsert[bigalField] = false;
              }
            }
          }

          if (argv.v) {
            console.log(JSON.stringify(objectToInsert, null, 1));
          }

          return objectToInsert;
        }));

        await collection.updateMany({
          _id: {
            $in: _.map(records, '_id')
          },
        }, {
          $set: {
            pgReplicated: true,
          }
        });

        console.timeEnd(`${sqlTable} - ${startCount}`);
        count += records.length;
      }

      console.timeEnd(`${sqlTable} - total time`);
      console.log(`\t${count} - records migrated`);
    }
  }

  // region Cleanup
  await sqlDb.end();
  await mongoClient.close();
  // endregion
}()).catch((ex) => {
  console.log(ex.stack);
});
