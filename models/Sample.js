'use strict';

module.exports = {
  tableName: 'table_name_in_pg',
  autoCreatedAt: true,
  autoUpdatedAt: true,
  attributes: {
    id: {
      type: 'string',
      unique: true,
      primaryKey: true,
      columnName: 'id',
    },

    name: {
      type: 'string',
      required: true,
      columnName: 'name',
    },

    user: {
      model: 'User',
      columnName: 'user_id',
    },

    foos: {
      type: 'array',
      defaultsTo: [],
      columnName: 'foo_ids',
    },

    data: {
      type: 'json',
      columnName: 'data',
    },

    image: {
      type: 'binary',
      columnName: 'image',
    },

    createdAt: {
      type: 'datetime',
      columnName: 'created_at',
    },

    updatedAt: {
      type: 'datetime',
      columnName: 'updated_at',
    },
  },
};
