export const DB_TYPES = {
  mysql:         { label: 'MySQL',         tagColor: 'blue',    hexColor: '#1677ff', port: 3306,  auth: true,  sql: true,  slowQuery: true,  backup: true },
  mariadb:       { label: 'MariaDB',       tagColor: 'blue',    hexColor: '#00b5d8', port: 3306,  auth: true,  sql: true,  slowQuery: true,  backup: true },
  postgresql:    { label: 'PostgreSQL',    tagColor: 'purple',  hexColor: '#722ed1', port: 5432,  auth: true,  sql: true,  slowQuery: false, backup: true },
  tidb:          { label: 'TiDB',          tagColor: 'geekblue',hexColor: '#2f54eb', port: 4000,  auth: true,  sql: true,  slowQuery: true,  backup: true },
  redis:         { label: 'Redis',         tagColor: 'magenta', hexColor: '#eb2f96', port: 6379,  auth: false, sql: false, slowQuery: false, backup: true },
  mongodb:       { label: 'MongoDB',       tagColor: 'cyan',    hexColor: '#13c2c2', port: 27017, auth: true,  sql: false, slowQuery: false, backup: true },
  mssql:         { label: 'SQL Server',    tagColor: 'orange',  hexColor: '#fa8c16', port: 1433,  auth: true,  sql: true,  slowQuery: false, backup: true },
  oracle:        { label: 'Oracle',        tagColor: 'red',     hexColor: '#cf1322', port: 1521,  auth: true,  sql: false, slowQuery: false, backup: true },
  sqlite:        { label: 'SQLite',        tagColor: 'green',   hexColor: '#52c41a', port: 0,     auth: false, sql: true,  slowQuery: false, backup: true },
  clickhouse:    { label: 'ClickHouse',    tagColor: 'gold',    hexColor: '#d48806', port: 8123,  auth: true,  sql: true,  slowQuery: false, backup: true },
  elasticsearch: { label: 'Elasticsearch', tagColor: 'volcano', hexColor: '#d4380d', port: 9200,  auth: false, sql: false, slowQuery: false, backup: true },
  cassandra:     { label: 'Cassandra',     tagColor: 'lime',    hexColor: '#7cb305', port: 9042,  auth: false, sql: false, slowQuery: false, backup: true },
};

export const DB_TYPE_OPTIONS = Object.entries(DB_TYPES).map(([value, conf]) => ({
  value,
  label: conf.label,
}));

export function getDbTypeConfig(type) {
  return DB_TYPES[type] || { label: type, tagColor: 'default', hexColor: '#8c8c8c', port: 3306, auth: true, sql: false, slowQuery: false, backup: false };
}