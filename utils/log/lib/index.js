'use strict'

const log = require('npmlog')

// 传入LOG_LEVEL 改变 level，默认 info 2000
log.setLevel = (level) => {
  // log.level = process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'info'
  log.level = process.env.LOG_LEVEL = level
}
log.level = process.env.LOG_LEVEL ? process.env.LOG_LEVEL : 'info'

log.heading = 'magic'
// log.headingStyle = { fg: 'red', bg: 'black' }

log.addLevel('success', 2000, { fg: 'green', bold: true })
module.exports = log

