// store.js
import { observable, action, runInAction } from "mobx";
import { http } from 'libs';

class DatabaseStore {
  // ========== 可观察状态 ==========
  @observable list = [];
  @observable formVisible = false;
  @observable editRecord = null;
  @observable detailVisible = false;
  @observable detailRecord = {};
  @observable detailLoading = false;
  @observable detailData = null;
  @observable sqlVisible = false;
  @observable sqlRecord = {};
  @observable total = 0;
  @observable online = 0;
  @observable mysql = 0;
  @observable redis = 0;
  @observable loading = false;

  // 分页状态
  @observable pagination = {
    current: 1,
    pageSize: 10,
    total: 0,
  };

  // ========== 动作 ==========
  @action
  setPagination(pagination) {
    this.pagination = { ...this.pagination, ...pagination };
    this.pagination.total = this.total;
  }

  // 加载数据（异步）
  @action
  async loadData(params = {}) {
    this.loading = true;
    try {
      const { current, pageSize } = this.pagination;
      const query = {
        page: params.page || current,
        page_size: params.pageSize || pageSize,
        ...params,
      };

      const response = await http.get('/api/db/instances/', { params: query });

      runInAction(() => {
        const data = response;
        this.list = data.results || [];
        this.total = data.count || 0;
        this.online = data.online || 0;
        this.mysql = data.mysql || 0;
        this.redis = data.redis || 0;

        this.pagination.current = query.page;
        this.pagination.pageSize = query.page_size;
        this.pagination.total = this.total;
      });
    } catch (error) {
      console.error('加载数据库列表失败:', error);
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }




  // 删除数据库
  @action
  async deleteDatabase(id) {
    try {
      await http.delete(`/api/db/instances/${id}/`);
      await this.loadData();
    } catch (error) {
      console.error('删除失败:', error);
      throw error;
    }
  }

  // ========== 新增：创建数据库连接 ==========
  @action
  async createDatabase(values) {
    try {
      await http.post('/api/db/instances/', values);
      // 创建成功后重新加载列表（保持分页一致性）
      await this.loadData();
      return true;
    } catch (error) {
      console.error('创建数据库连接失败:', error);
      throw error;
    }
  }

  // ========== 新增：更新数据库连接 ==========
  @action
  async updateDatabase(id, values) {
    try {
      await http.put(`/api/db/instances/${id}/`, values);
      // 更新成功后重新加载列表
      await this.loadData();
      return true;
    } catch (error) {
      console.error('更新数据库连接失败:', error);
      throw error;
    }
  }



showForm = () => {
    this.editRecord = null;
    this.formVisible = true;
};

showEdit = (record) => {
    this.editRecord = record;
    this.formVisible = true;
};

  showDetail = (record) => {
    this.detailRecord = record;
    this.detailVisible = true;
    this.fetchDetail(record.id);
  };

  showSql = (record) => {
    this.sqlRecord = record;
    this.sqlVisible = true;
    this.fetchDetail(record.id);
  };

  @action
  async fetchDetail(id) {
    this.detailLoading = true;
    this.detailData = null;
    try {
      const res = await http.get(`/api/db/instances/${id}/`);
      runInAction(() => {
        this.detailData = res;
      });
    } catch (error) {
      console.error('加载详情失败:', error);
    } finally {
      runInAction(() => {
        this.detailLoading = false;
      });
    }
  }
}

export default new DatabaseStore();