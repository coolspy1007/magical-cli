const service = require('@magical-cli/request')


function getOssFiles(params) {
  return service.request({
    url: 'oss/get',
    params
  })
}

module.exports = { getOssFiles }