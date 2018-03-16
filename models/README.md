# Models

A model represents a collection of structured data, usually corresponding to a single table or collection in a database. Out of the box,
koa-mvc supports waterline.js syntax for defining models. The `orm` plugin exposes model classes to `app.orm.<class-name>`.
Each class exposes [BigAl model methods](https://github.com/mpirik/bigal#model-class-methods).

# Example

## User.js

```js
'use strict';

module.exports = {
  schema: true,
  autoUpdatedAt: true,
  autoCreatedAt: true,
  attributes: {
    id: {
      type: 'int',
      unique: true,
      primaryKey: true,
    },

    name: {
      type: 'string',
    },

    email: {
      type: 'string',
      unique: true,
    },

    lastActiveAt: {
      type: 'datetime',
      columnName: 'last_active_at',
    },

    isDeleted: {
      type: 'boolean',
      defaultsTo: false,
      columnName: 'is_deleted',
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
```
