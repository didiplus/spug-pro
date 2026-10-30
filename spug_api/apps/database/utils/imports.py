"""可选数据库驱动统一导入，缺失时设为 None"""
try:
    import pymysql
except ImportError:
    pymysql = None

try:
    import redis
except ImportError:
    redis = None

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    psycopg2 = None

try:
    from pymongo import MongoClient
except ImportError:
    MongoClient = None

try:
    import pymssql
except ImportError:
    pymssql = None

try:
    import oracledb
except ImportError:
    oracledb = None

try:
    import sqlite3 as sqlite3_module
except ImportError:
    sqlite3_module = None

try:
    import clickhouse_connect
except ImportError:
    clickhouse_connect = None

try:
    from elasticsearch import Elasticsearch as ESClient
except ImportError:
    ESClient = None

try:
    from cassandra.cluster import Cluster as CassandraCluster
except ImportError:
    CassandraCluster = None