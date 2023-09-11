/* eslint-disable no-undef */
db.getSiblingDB('sder').createUser({
  user: 'api-sder',
  pwd: 'password',
  roles: [{ role: 'readWrite', db: 'sder' }]
})

