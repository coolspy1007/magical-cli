const GitServer = require('./GitServer')

const { getGithubOrgs, getGithubUser, getGithubRepo, createGithubRepo, createGithubOrgRepo } = require('../api/github')

class Github extends GitServer {
  constructor() {
    super('github')
  }

  async getUser() {
    return getGithubUser(this.token)
  }

  async getOrgs(username) {
    return getGithubOrgs(this.token, username)
  }

  async getRepo(login, name) {
    return getGithubRepo(this.token, login, name)
  }

  async createRepo(name) {
    return createGithubRepo(this.token, name)
  }

  async createOrgRepo(org, name) {
    return createGithubOrgRepo(this.token, org, name)
  }

  getRemote(login, name) {
    // git@github.com:coolspy1007/test.git
    return `git@github.com:${login}/${name}.git`
  }

  getTokenUrl() {
    return 'https://github.com/settings/keys'
  }

  getTokenHelpUrl() {
    return 'https://docs.github.com/en/github/authenticating-to-github/connecting-to-github-with-ssh'
  }
}

module.exports = Github