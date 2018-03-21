# BigAl mongo2sql

A relatively fast data migrator to move data from mongo db to postgres. The tool supports iteratively migrating data, but it does not support removing previously replicated records from postgres if they're removed from Mongo.

## Installation

```
npm install
```

## The Collection Map file

[MoSQL style collection map files](https://github.com/stripe/mosql#the-collection-map-file) are used to translate the mongodb table and column names with their postgres counterparts.

## Usage

```
node index.js [-c collections.yaml] [-m mongodb://mongo-url] [-s postgres://sql-url]
```

* Add `-v` for verbose logging

## Notes

* This tool will add a column called `pgReplicated` to the records in mongo. That column is used to determine if the record has been migrated or not (useful for incremental migrations). For tables larger than a few thousand records, it is advisable to add an index:

    ```
    mongo_cli> db.collection.createIndex({ pgReplicated: 1 });
    ```

* If you need to stop the migration process at any time, create a file `stop.txt` in the project root directory and the tool will gracefully exit the migration loop on the next iteration.
