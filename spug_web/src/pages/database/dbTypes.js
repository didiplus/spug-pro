import { DB_TYPE_HEX } from 'styles/statusPresets';

export const DB_TYPES = {
  mysql:         { label: 'MySQL',         tagColor: 'blue',    hexColor: DB_TYPE_HEX.mysql,         port: 3306,  auth: true,  sql: true,  slowQuery: true,  backup: true },
  mariadb:       { label: 'MariaDB',       tagColor: 'blue',    hexColor: DB_TYPE_HEX.mariadb,       port: 3306,  auth: true,  sql: true,  slowQuery: true,  backup: true },
  postgresql:    { label: 'PostgreSQL',    tagColor: 'purple',  hexColor: DB_TYPE_HEX.postgresql,    port: 5432,  auth: true,  sql: true,  slowQuery: false, backup: true },
  tidb:          { label: 'TiDB',          tagColor: 'geekblue',hexColor: DB_TYPE_HEX.tidb,          port: 4000,  auth: true,  sql: true,  slowQuery: true,  backup: true },
  redis:         { label: 'Redis',         tagColor: 'magenta', hexColor: DB_TYPE_HEX.redis,         port: 6379,  auth: false, sql: false, slowQuery: false, backup: true },
  mongodb:       { label: 'MongoDB',       tagColor: 'cyan',    hexColor: DB_TYPE_HEX.mongodb,       port: 27017, auth: true,  sql: false, slowQuery: false, backup: true },
  mssql:         { label: 'SQL Server',    tagColor: 'orange',  hexColor: DB_TYPE_HEX.mssql,         port: 1433,  auth: true,  sql: true,  slowQuery: false, backup: true },
  oracle:        { label: 'Oracle',        tagColor: 'red',     hexColor: DB_TYPE_HEX.oracle,        port: 1521,  auth: true,  sql: false, slowQuery: false, backup: true },
  sqlite:        { label: 'SQLite',        tagColor: 'green',   hexColor: DB_TYPE_HEX.sqlite,        port: 0,     auth: false, sql: true,  slowQuery: false, backup: true },
  clickhouse:    { label: 'ClickHouse',    tagColor: 'gold',    hexColor: DB_TYPE_HEX.clickhouse,    port: 8123,  auth: true,  sql: true,  slowQuery: false, backup: true },
  elasticsearch: { label: 'Elasticsearch', tagColor: 'volcano', hexColor: DB_TYPE_HEX.elasticsearch, port: 9200,  auth: false, sql: false, slowQuery: false, backup: true },
  cassandra:     { label: 'Cassandra',     tagColor: 'lime',    hexColor: DB_TYPE_HEX.cassandra,     port: 9042,  auth: false, sql: false, slowQuery: false, backup: true },
};

export const DB_TYPE_OPTIONS = Object.entries(DB_TYPES).map(([value, conf]) => ({
  value,
  label: conf.label,
}));

export function getDbTypeConfig(type) {
  return DB_TYPES[type] || { label: type, tagColor: 'default', hexColor: '#8c8c8c', port: 3306, auth: true, sql: false, slowQuery: false, backup: false };
}
