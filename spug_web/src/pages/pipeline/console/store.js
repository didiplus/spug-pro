import { observable } from 'mobx';

class Store {
  @observable visible = false;
  @observable recordD = {};
  @observable token = '';
  @observable nodes = [];
  @observable node = {};
  @observable outputs = {};
  @observable readonly = false;
  @observable wsIndex = 0;
}

export default new Store()