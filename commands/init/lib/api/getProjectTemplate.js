const service = require('@magical-cli/request')


module.exports = function () {
  return service({
    url: '/project/getTemplate'
  })
}