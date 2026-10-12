const { version } = require('./package.json');
// Must equal the installed zapier-platform-core version (pinned in package.json).
const platformVersion = '19.2.0';
const authentication = require('./authentication');
const { includeBearer, handleErrors } = require('./middleware');
const projects = require('./triggers/projects');
const newScan = require('./triggers/new_scan');
const newDeliverable = require('./triggers/new_deliverable');
const logAction = require('./creates/log_action');
const findDeliverable = require('./searches/find_deliverable');
const findGaps = require('./searches/find_gaps');

module.exports = {
  version,
  platformVersion,
  authentication,
  beforeRequest: [includeBearer],
  afterResponse: [handleErrors],
  triggers: { [projects.key]: projects, [newScan.key]: newScan, [newDeliverable.key]: newDeliverable },
  creates: { [logAction.key]: logAction },
  searches: { [findDeliverable.key]: findDeliverable, [findGaps.key]: findGaps },
};
