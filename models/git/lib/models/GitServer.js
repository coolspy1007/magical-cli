function error(methodName) {
  throw new Error(`${methodName} 方法必须实现`)
}

class GitServer {
  constructor(type) {
    this.type = type
    this.token = null
  }

  setToken(token) {
    this.token = token
  }

  getRepo(login, name) {
    error('getRepo')
  }

  getOrgRepo(login, name) {
    error('getRepo')
  }

  createRepo(name) {
    error('createRepo')
  }

  createOrgRepo() {
    error('createOrgRepo')
  }

  getRemote() {
    error('getRemote')
  }

  getUser() {
    error('getUser')
  }

  getOrgs() {
    error('getOrgs')
  }

  getTokenUrl() {
    error('getTokenUrl')
  }

  getTokenHelpUrl() {
    error('getTokenHelpUrl')
  }
}

module.exports = GitServer