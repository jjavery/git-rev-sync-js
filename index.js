'use strict';

var childProcess = require('child_process');
var escapeStringRegexp = require('escape-string-regexp');
var fs = require('graceful-fs');
var path = require('path');
var shell = require('shelljs');

var HAS_NATIVE_EXECSYNC = childProcess.hasOwnProperty('spawnSync');
var PATH_SEP = path.sep;
var RE_BRANCH = /^ref: refs\/heads\/(.*)\n/;

function _command(cmd, args) {
  var result;

  if (HAS_NATIVE_EXECSYNC) {
    result = childProcess.spawnSync(cmd, args);

    if (result.status !== 0) {
      throw new Error('[git-rev-sync] failed to execute command: ' + result.stderr);
    }

    return result.stdout.toString('utf8').replace(/^\s+|\s+$/g, '');
  }

  result = shell.exec(cmd + ' ' + args.join(' '), {silent: true});

  if (result.code !== 0) {
    throw new Error('[git-rev-sync] failed to execute command: ' + result.stdout);
  }

  return result.stdout.toString('utf8').replace(/^\s+|\s+$/g, '');
}

function _getGitDirectory(start) {
  if (start === undefined) {
    start = module.parent.filename;
  }

  if (typeof start === 'string') {
    start = start.split(PATH_SEP);
  }

  var testPath = start.join(PATH_SEP);

  if (!testPath.length) {
    throw new Error('[git-rev-sync] no git repository found');
  }

  testPath = path.resolve(testPath, '.git');

  if (fs.existsSync(testPath)) {
    if (!fs.statSync(testPath).isDirectory()) {
      var parentRepoPath = fs.readFileSync(testPath, 'utf8').trim().split(' ').pop();

      if (fs.existsSync(parentRepoPath)) {
        return path.resolve(parentRepoPath);
      }

      var submoduleName = parentRepoPath.split('/').pop();
      var submodulePath = '../.git/modules/' + submoduleName;

      if (fs.existsSync(submodulePath)) {
        return path.resolve(submodulePath);
      }

      throw new Error('[git-rev-sync] could not find repository from path' + parentRepoPath);
    }

    return testPath;
  }

  start.pop();

  return _getGitDirectory(start);
}

function branch(dir) {
  var gitDir = _getGitDirectory(dir);

  var head = fs.readFileSync(path.resolve(gitDir, 'HEAD'), 'utf8');
  var b = head.match(RE_BRANCH);

  if (b) {
    return b[1];
  }

  return 'Detached: ' + head.trim();
}

function long(dir) {
  var b = branch(dir);

  if (/Detached: /.test(b)) {
    return b.substr(10);
  }

  var gitDir = _getGitDirectory(dir);
  var refsFilePath = path.resolve(gitDir, 'refs', 'heads', b);
  var ref;

  if (fs.existsSync(refsFilePath)) {
    ref = fs.readFileSync(refsFilePath, 'utf8');
  } else {
    // If there isn't an entry in /refs/heads for this branch, it may be that
    // the ref is stored in the packfile (.git/packed-refs). Fall back to
    // looking up the hash here.
    var refToFind = ['refs', 'heads', b].join('/');
    var packfileContents = fs.readFileSync(path.resolve(gitDir, 'packed-refs'), 'utf8');
    var packfileRegex = new RegExp('(.*) ' + escapeStringRegexp(refToFind));
    ref = packfileRegex.exec(packfileContents)[1];
  }

  return ref.trim();
}

function short(dir) {
  return long(dir).substr(0, 7);
}

function message() {
  return _command('git', ['log', '-1', '--pretty=%B']);
}

function tag(markDirty, abbrev) {
  abbrev = abbrev || 0;

  var args = ['describe', '--always', '--tag', '--abbrev=' + abbrev];

  if (markDirty) {
    args.push('--dirty');
  }

  return _command('git', args);
}

function isTagDirty() {
  try {
    _command('git', ['describe', '--exact-match', '--tags']);
  } catch (e) {
    if (e.message.indexOf('no tag exactly matches')) {
      return true;
    }

    throw e;
  }
  return false;
}

function date() {
  return new Date(_command('git', ['log', '--no-color', '-n', '1', '--pretty=format:"%ad"']));
}

function count() {
  return parseInt(_command('git', ['rev-list', '--all', '--count']), 10);
}

function log() {
  throw new Error('not implemented');
}

module.exports = {
  branch : branch,
  count: count,
  date: date,
  log : log,
  long : long,
  message : message,
  short : short,
  tag : tag,
  isTagDirty: isTagDirty
};
