const GitServer = require('./GitServer')
const {
  getGiteeUser,
  getGiteeOrgs,
  getGiteeRepo,
  createGiteeRepo,
  createGiteeOrgRepo
} = require('../api/gitee')

class Gitee extends GitServer {
  constructor() {
    super('gitee')
  }

  async getUser() {
    return getGiteeUser(this.token)
  }

  async getOrgs(username) {
    return getGiteeOrgs(this.token, username)
  }

  async getRepo(login, name) {
    return getGiteeRepo(this.token, login, name)
  }

  async createRepo(name) {
    return createGiteeRepo(this.token, name)
  }

  async createOrgRepo(org, name) {
    return createGiteeOrgRepo(this.token, org, name)
  }

  getRemote(login, name) {
    // git@gitee.com:magical-cli/test.git
    return `git@gitee.com:${login}/${name}.git`
  }
  getTokenUrl() {
    return 'https://gitee.com/profile/sshkeys'
  }

  getTokenHelpUrl() {
    return 'https://gitee.com/help/articles/4191'
  }
}

module.exports = Gitee