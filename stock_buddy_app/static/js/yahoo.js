exports = module.exports = require('./lib');
exports.HISTORICAL_CRUMB_URL = 'https://finance.yahoo.com/quote/$SYMBOL/history';
exports.HISTORICAL_DOWNLOAD_URL = 'https://query1.finance.yahoo.com/v7/finance/download/$SYMBOL';
exports.SNAPSHOT_URL = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary/$SYMBOL';
var os = require('os');

var util = require('util');

var _ = require('lodash');

var S = require('string');

var moment = require('moment');

var Promise = require('bluebird');

var _constants = require('./constants');

var _utils = require('./utils');

var getCrumb = require('./yahooCrumb').getCrumb;

function _sanitizeHistoricalOptions(options) {
  if (!_.isPlainObject(options)) {
    throw new Error('"options" must be a plain object.');
  }

  if (_.isUndefined(options.symbol) && _.isUndefined(options.symbols)) {
    throw new Error('Either "options.symbol" or "options.symbols" must be defined.');
  }

  if (!_.isUndefined(options.symbol) && !_.isUndefined(options.symbols)) {
    throw new Error('Either "options.symbol" or "options.symbols" must be undefined.');
  }

  if (!_.isUndefined(options.error) && !_.isBoolean(options.error)) {
    throw new Error('"options.error" must be a boolean value');
  }

  if (!_.isUndefined(options.symbol)) {
    if (!_.isString(options.symbol) || _.isEmpty(options.symbol)) {
      throw new Error('"options.symbol" must be a non-empty string.');
    }
  } else {
    if (!_.isArray(options.symbols) || _.isEmpty(options.symbols)) {
      throw new Error('"options.symbols" must be a non-empty string array.');
    }
  }

  if (_.isString(options.from) && !_.isEmpty(options.from)) {
    options.from = moment(options.from);

    if (!options.from.isValid()) {
      throw new Error('"options.from" must be a valid date string.');
    }
  } else {
    if (!_.isDate(options.from) && !_.isUndefined(options.from) && !_.isNull(options.from)) {
      throw new Error('"options.from" must be a date or undefined/null.');
    }

    if (_.isDate(options.from)) {
      options.from = moment(options.from);
    }
  }

  if (_.isString(options.to) && !_.isEmpty(options.to)) {
    options.to = moment(options.to);

    if (!options.to.isValid()) {
      throw new Error('"options.to" must be a valid date string.');
    }
  } else {
    if (!_.isDate(options.to) && !_.isUndefined(options.to) && !_.isNull(options.to)) {
      throw new Error('"options.to" must be a date or undefined/null.');
    }

    if (_.isDate(options.to)) {
      options.to = moment(options.to);
    }
  }

  if (_.isString(options.period)) {
    if (!_.includes(['d', 'w', 'm', 'v'], options.period)) {
      throw new Error('"options.period" must be "d", "w", "m", or "v".');
    }
  } else {
    if (!_.isUndefined(options.period) && !_.isNull(options.period)) {
      throw new Error('"options.period" must be a string or undefined/null.');
    }
  }

  if (!options.from) {
    options.from = moment('1900-01-01');
  }

  if (!options.to) {
    options.to = moment({
      hour: 0
    });
  }

  if (!options.period) {
    options.period = '1d';
  }

  options.events = 'history'; // Convert to yahoo v7 API

  switch (options.period) {
    case 'd':
      options.period = '1d';
      break;

    case 'w':
      options.period = '1wk';
      break;

    case 'm':
      options.period = '1mo';
      break;

    case 'v':
      options.period = '1d';
      options.events = 'div';
      break;
    // No default case needed, options are sanitized above.
  }

  if ((options.from || options.to) && options.from.isAfter(options.to)) {
    throw new Error('"options.to" must be be greater than or equal to "options.from".');
  }
}

function _transformHistorical(symbol, data) {
  var headings = data.shift();
  return _(data).reverse().map(function (line) {
    var result = {};
    headings.forEach(function (heading, i) {
      var value = line[i];

      if (_.includes(['Volume'], heading)) {
        value = _utils.toInt(value, null);
      } else if (_.includes(['Open', 'High', 'Low', 'Close', 'Adj Close', 'Dividends'], heading)) {
        value = _utils.toFloat(value, null);
      } else if (_.includes(['Date'], heading)) {
        value = _utils.toDate(value, null);

        if (value && !moment(value).isValid()) {
          value = null;
        }
      }

      result[_utils.camelize(heading)] = value;
    });
    result.symbol = symbol;
    return result;
  }).value();
}

function historical(options, optionalHttpRequestOptions, cb) {
  options = _.clone(options);

  _sanitizeHistoricalOptions(options);

  var symbols = options.symbols || _.flatten([options.symbol]);

  if (optionalHttpRequestOptions && typeof optionalHttpRequestOptions === 'function') {
    cb = optionalHttpRequestOptions;
    optionalHttpRequestOptions = undefined;
  }

  return getCrumb(symbols[0]).then(function (crumb) {
    return Promise.map(symbols, function (symbol) {
      var url = _constants.HISTORICAL_DOWNLOAD_URL.replace(/\$SYMBOL/, symbol);

      return _utils.download(url, {
        period1: options.from.format('X'),
        period2: options.to.format('X'),
        interval: options.period,
        events: options.events,
        crumb: crumb
      }, optionalHttpRequestOptions).then(_utils.parseCSV).then(function (data) {
        return _transformHistorical(symbol, data);
      }).catch(function (err) {
        if (options.error) {
          throw err;
        } else {
          return [];
        }
      });
    }, {
      concurrency: options.maxConcurrentSymbols || os.cpus().length
    }).then(function (result) {
      if (options.symbols) {
        return _.zipObject(symbols, result);
      } else {
        return result[0];
      }
    }).catch(function (err) {
      throw new Error(util.format('Failed to download data (%s)', err.message));
    }).nodeify(cb);
  });
}

module.exports = historical;
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import proxyquire from 'proxyquire';
import { parseAndGetCrumb } from './yahooCrumb';
import { stubbedFor } from '../tests/testUtils';
const should = chai.should();
chai.use(chaiAsPromised);

function assertValidHistoricalResult(result) {
  /*
    [
      {
        date: Thu Nov 07 2013 00:00:00 GMT-0500 (EST),
        open: 45.1,
        high: 50.09,
        low: 44,
        close: 44.9,
        volume: 117701700,
        adjClose: 44.9,
        symbol: 'TWTR'
      },
      ...
      {
        date: Thu Nov 14 2013 00:00:00 GMT-0500 (EST),
        open: 42.34,
        high: 45.67,
        low: 42.24,
        close: 44.69,
        volume: 11090800,
        adjClose: 44.69,
        symbol: 'TWTR'
      }
    ]
  */
  result.should.be.an('array');
  result.should.have.length.above(0);
  const row = result[0];
  row.should.include.keys('date', 'open', 'high', 'low', 'close', 'volume', 'adjClose', 'symbol');
  row.should.be.an('object');
  row.date.should.be.an.instanceOf(Date);
  row.open.should.be.a('number');
  row.high.should.be.a('number');
  row.low.should.be.a('number');
  row.close.should.be.a('number');
  row.volume.should.be.a('number');
  row.adjClose.should.be.a('number');
  row.symbol.should.be.a('string');
}

describe('historical', () => {
  it('correctly transforms current Yahoo response (2017-05-21)', async () => {
    const historical = proxyquire('./historical', stubbedFor('historyCsv'));
    const result = await historical({
      // Note, these aren't actually used in this test - data from a fixture
      symbol: 'AAPL',
      from: '2012-01-01'
    });
    assertValidHistoricalResult(result);
  });
});
export { assertValidHistoricalResult };
exports.historical = require('./historical');
exports.snapshot = require('./snapshot').default;
exports.quote = require('./quote').default;
var os = require('os');

var util = require('util');

var _ = require('lodash');

var Promise = require('bluebird');

var _constants = require('./constants');

var _utils = require('./utils');

var getCrumb = require('./yahooCrumb').getCrumb;

var validModules = ['summaryProfile', 'financialData', 'recommendationTrend', 'upgradeDowngradeHistory', 'earnings', 'price', 'summaryDetail', 'defaultKeyStatistics', 'calendarEvents'];
var dateFields = {
  summaryDetail: ['exDividendDate'],
  calendarEvents: ['exDividendDate', 'dividendDate'],
  upgradeDowngradeHistory: ['history.epochGradeDate'],
  price: ['preMarketTime', 'postMarketTime', 'regularMarketTime'],
  defaultKeyStatistics: ['lastFiscalYearEnd', 'nextFiscalYearEnd', 'mostRecentQuarter', 'lastSplitDate']
};

function _sanitizeQuoteOptions(options) {
  if (!_.isPlainObject(options)) {
    throw new Error('"options" must be a plain object.');
  }

  if (_.isUndefined(options.symbol) && _.isUndefined(options.symbols)) {
    throw new Error('Either "options.symbol" or "options.symbols" must be defined.');
  }

  if (!_.isUndefined(options.symbol) && !_.isUndefined(options.symbols)) {
    throw new Error('Either "options.symbol" or "options.symbols" must be undefined.');
  }

  if (!_.isUndefined(options.symbol)) {
    if (!_.isString(options.symbol) || _.isEmpty(options.symbol)) {
      throw new Error('"options.symbol" must be a non-empty string.');
    }
  } else {
    if (!_.isArray(options.symbols) || _.isEmpty(options.symbols)) {
      throw new Error('"options.symbols" must be a non-empty string array.');
    }
  }

  if (options.modules) {
    if (!_.isArray(options.modules)) throw new Error('"options.modules" must be a non-empty string array or undefined.');
  } else {
    options.modules = ['price', 'summaryDetail'];
  }

  var invalid = _.difference(options.modules, validModules);

  if (invalid.length) {
    var available = _.difference(validModules, options.modules);

    throw new Error("[yahoo-finance] quote(): The following requested " + "modules do not exist: " + JSON.stringify(invalid) + ".  Did you mean one of: " + JSON.stringify(available) + "?");
  }
}

function transformDates(result) {
  _.each(_.keys(result), function (module) {
    _.each(dateFields[module], function (field) {
      if (field.indexOf('.') === -1) {
        if (result[module][field]) result[module][field] = new Date(result[module][field] * 1000);
      } else {
        var parts = field.split('.');
        var arrayName = parts[0];
        var subField = parts[1];
        if (result[module][arrayName]) _.each(result[module][arrayName], function (row) {
          if (row[subField]) row[subField] = new Date(row[subField] * 1000);
        });
      }
    });
  });

  return result;
}

function quote(options, optionalHttpRequestOptions, cb) {
  if (_.isString(options)) {
    options = {
      symbol: options
    };

    if (_.isArray(optionalHttpRequestOptions)) {
      options.modules = optionalHttpRequestOptions;
      optionalHttpRequestOptions = undefined;
    }
  }

  var symbols = options.symbols || _.flatten([options.symbol]);

  options = _.clone(options);

  _sanitizeQuoteOptions(options);

  if (optionalHttpRequestOptions && typeof optionalHttpRequestOptions == 'function') {
    cb = optionalHttpRequestOptions;
    optionalHttpRequestOptions = {};
  } else if (!optionalHttpRequestOptions) {
    optionalHttpRequestOptions = {};
  }

  optionalHttpRequestOptions.json = true;
  return getCrumb(symbols[0]).then(function (crumb) {
    return Promise.map(symbols, function (symbol) {
      var url = _constants.SNAPSHOT_URL.replace(/\$SYMBOL/, symbol);

      return _utils.download(url, {
        formatted: 'false',
        crumb: crumb,
        modules: options.modules.join(','),
        corsDomain: 'finance.yahoo.com'
      }, optionalHttpRequestOptions).then(function (result) {
        var quoteSummary = result.quoteSummary;
        if (!quoteSummary || quoteSummary.error) throw new Error(quoteSummary.error);
        var result = quoteSummary.result;
        if (!_.isArray(result) || result.length > 1) throw new Error("quoteSummary format has changed, please report " + "this.");
        return result[0];
      }).then(transformDates);
    }, {
      concurrency: options.maxConcurrentSymbols || os.cpus().length
    }).then(function (results) {
      if (options.symbols) {
        return _.zipObject(symbols, results);
      } else {
        return results[0];
      }
    }).catch(function (err) {
      throw new Error(util.format('Failed to download data (%s)', err.message));
    }).nodeify(cb);
  });
} // API (ES6 syntax with default export)


exports.__esModule = true;
exports.default = quote; // Used by snapshot

exports.dateFields = dateFields; // For tests

exports._sanitizeQuoteOptions = _sanitizeQuoteOptions;
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import proxyquire from 'proxyquire'; // for nodeify to work with stubbed out functions

import BluebirdPromise from 'bluebird';
import { parseAndGetCrumb } from './yahooCrumb';
import { getFile, stubbedFor } from '../tests/testUtils';
import quote, { _sanitizeQuoteOptions } from './quote';
const should = chai.should();
chai.use(chaiAsPromised);
chai.use(sinonChai);
describe('quote', () => {
  describe('_sanitizeQuoteOptions()', () => {
    it('throws on invalid modules', () => {
      (function () {
        _sanitizeQuoteOptions({
          symbol: 'MSFT',
          modules: ['price', 'invalid']
        });
      }).should // Shows invalid modules and suggests other unused ones
      .throw(/(?:do not exist.*"invalid".*Did you mean)(?!"price")/);
    });
  });
  describe('quote()', () => {
    it('calls _sanitizeQuoteOptions()', () => {
      // no need for await here since options are sanitized before promise made
      (function () {
        quote({
          symbol: 'MSFT',
          modules: ['price', 'invalid']
        });
      }).should.throw();
    });
    it('correctly transforms current Yahoo response (2017-05-21)', async () => {
      const quote = proxyquire('./quote', stubbedFor('quoteJson')).default;
      const result = await quote({
        // Note, these aren't actually used in this test - data from a fixture
        symbol: 'MSFT'
      });
      result.price.symbol.should.equal('MSFT'); // check dates

      result.summaryDetail.exDividendDate.should.be.a('date');
      result.calendarEvents.exDividendDate.should.be.a('date');
      result.calendarEvents.dividendDate.should.be.a('date');
      result.upgradeDowngradeHistory.history[0].epochGradeDate.should.be.a('date');
      result.upgradeDowngradeHistory.history[1].epochGradeDate.should.be.a('date');
      result.price.preMarketTime.should.be.a('date');
      result.price.postMarketTime.should.be.a('date');
      result.price.regularMarketTime.should.be.a('date');
      result.defaultKeyStatistics.lastFiscalYearEnd.should.be.a('date');
      result.defaultKeyStatistics.nextFiscalYearEnd.should.be.a('date');
      result.defaultKeyStatistics.mostRecentQuarter.should.be.a('date');
      result.defaultKeyStatistics.lastSplitDate.should.be.a('date');
    });
    it('accepts multiple symbols', async () => {
      const download = sinon.stub().usingPromise(BluebirdPromise).resolves(getFile('quoteJson'));
      const quote = proxyquire('./quote', {
        './yahooCrumb': {
          async getCrumb() {
            return 'crumb';
          }

        },
        './utils': {
          download
        }
      }).default;
      const result = await quote({
        symbols: ['TSLA', 'MSFT']
      });
      download.should.have.been.calledTwice;
      download.should.have.been.calledWithMatch(/TSLA$/);
      download.should.have.been.calledWithMatch(/MSFT$/);
      result.should.be.an('object');
      result.should.include.keys('TSLA', 'MSFT');
      result.TSLA.price.symbol.should.be.a('string');
      result.MSFT.price.symbol.should.be.a('string');
    });
  });
});
var os = require('os');

var util = require('util');

var _ = require('lodash');

var S = require('string');

var moment = require('moment');

var Promise = require('bluebird');

var _constants = require('./constants');

var _fields = require('./snapshotFields');

var _utils = require('./utils');

var getCrumb = require('./yahooCrumb').getCrumb;

var dateFields = require('./quote').dateFields;

var FIELDS_MAP_GITHUB_URL = 'https://github.com/pilwon/node-yahoo-finance/blob/master/lib/snapshotFields.js#L111'; // Fields from the old API that can be mapped to the current data

var mappedFields = _.filter(_.keys(_fields._map), function (field) {
  return !!_fields._map[field];
});

var requiredModuleForField = {};

_.each(mappedFields, function (field) {
  requiredModuleForField[field] = _fields._map[field].split('.')[0];
}); // Given a list of fields, return the names of all the modules needed to
// supply them.


function requiredModulesForFields(fields) {
  var modules = [];

  _.each(fields, function (field) {
    var module = requiredModuleForField[field];
    if (modules.indexOf(module) === -1) modules.push(module);
  });

  return modules;
}

var shownWarning = false;

function _sanitizeSnapshotOptions(options) {
  if (!_.isPlainObject(options)) {
    throw new Error('"options" must be a plain object.');
  }

  if (_.isUndefined(options.symbol) && _.isUndefined(options.symbols)) {
    throw new Error('Either "options.symbol" or "options.symbols" must be defined.');
  }

  if (!_.isUndefined(options.symbol) && !_.isUndefined(options.symbols)) {
    throw new Error('Either "options.symbol" or "options.symbols" must be undefined.');
  }

  if (!_.isUndefined(options.symbol)) {
    if (!_.isString(options.symbol) || _.isEmpty(options.symbol)) {
      throw new Error('"options.symbol" must be a non-empty string.');
    }
  } else {
    if (!_.isArray(options.symbols) || _.isEmpty(options.symbols)) {
      throw new Error('"options.symbols" must be a non-empty string array.');
    }
  }

  if ((!_.isArray(options.fields) || _.isEmpty(options.fields)) && !_.isUndefined(options.fields)) {
    throw new Error('"options.fields" must be a non-empty string array or undefined.');
  }

  if (options.fields) {
    var unavailable = _.difference(options.fields, mappedFields);

    if (unavailable.length) throw new Error("[yahoo-finance] snapshot(): The following fields " + "are no longer available in Yahoo's new API: " + JSON.stringify(unavailable) + ".  See if you can find something similar in the new quote() API, " + "otherwise unfortunately, you are out of luck.  Yahoo ended support " + "for their developer API some time ago and made no guarantees to " + "maintain that API.  You may want to also check our mapping function " + "at " + FIELDS_MAP_GITHUB_URL);

    if (!shownWarning) {
      console.warn("[yahoo-finance] snapshot() has been deprecated.  The " + "Yahoo Finance API has fundamentally changed recently.  We will " + "attempt to map the requested fields from the new API according to " + FIELDS_MAP_GITHUB_URL + ".  Please double check this map and your results to ensure " + "consistency.  This warning will only be shown once.");
      shownWarning = true;
    }
  } else {
    if (!options.ignoreAllFieldsWarning) {
      throw new Error("[yahoo-finance] snapshot(): No `fields` property was " + "given.  This used to return all fields available, but not all these " + "fields are available in Yahoo's new API.  We suggest you update " + "your code to use the new quote() API instead.  However, you can " + "simply specify the exact fields you need, and they'll be fetched if " + "available.  Alternative, pass { ignoreAllFieldsWarning: true } and " + "all available fields (from the new API) will be returned.  You can " + "see the full list of available mappings at " + FIELDS_MAP_GITHUB_URL);
    } else {
      // fetch all fields if undefined
      options.fields = mappedFields;
    }
  }

  options.modules = requiredModulesForFields(options.fields);
}

function _transformSnapshot(fields, symbols, data) {
  var quoteSummary = data.quoteSummary;
  if (!quoteSummary || quoteSummary.error) throw new Error(quoteSummary.error);
  var result = quoteSummary.result;
  if (!_.isArray(result) || result.length > 1) throw new Error("quoteSummary format has changed, please report this.");
  result = result[0]; // for 'n', store 'name' from result.price.name, etc.
  // for arrays like 'c', combine values into an array

  var out = {};

  _.each(fields, function (field) {
    // map { c: 'price.regularMarketChange,price.regularMarketChangePercent' }
    if (_fields._map[field].indexOf(',') > 0) {
      var dest = out[_utils.camelize(_fields[field])] = [];

      _.map(_fields._map[field].split(','), function (map) {
        // 'price.symbol' => ['price','symbol']
        map = map.split('.');
        dest.push(result[map[0]][map[1]]); // Assumption: no arrays use date fields (currently true)
      });
    } else {
      // 'price.symbol' => ['price','symbol']
      var map = _fields._map[field].split('.');

      var value = result[map[0]][map[1]];
      if (dateFields[map[0]] && dateFields[map[0]].indexOf(map[1]) !== -1) value = new Date(value * 1000);
      out[_utils.camelize(_fields[field])] = value;
    }
  });

  return out;
}

function snapshot(options, optionalHttpRequestOptions, cb) {
  var symbols = options.symbols || _.flatten([options.symbol]);

  options = _.clone(options);

  _sanitizeSnapshotOptions(options);

  if (optionalHttpRequestOptions && typeof optionalHttpRequestOptions == 'function') {
    cb = optionalHttpRequestOptions;
    optionalHttpRequestOptions = {};
  } else if (!optionalHttpRequestOptions) {
    optionalHttpRequestOptions = {};
  }

  optionalHttpRequestOptions.json = true;
  return getCrumb(symbols[0]).then(function (crumb) {
    return Promise.map(symbols, function (symbol) {
      var url = _constants.SNAPSHOT_URL.replace(/\$SYMBOL/, symbol);

      return _utils.download(url, {
        formatted: 'false',
        crumb: crumb,
        modules: options.modules.join(','),
        corsDomain: 'finance.yahoo.com'
      }, optionalHttpRequestOptions).then(function (data) {
        return _transformSnapshot(options.fields, symbols, data);
      });
    }, {
      concurrency: options.maxConcurrentSymbols || os.cpus().length
    }).then(function (results) {
      if (options.symbols) {
        return _.zipObject(symbols, results);
      } else {
        return results[0];
      }
    }).catch(function (err) {
      throw new Error(util.format('Failed to download data (%s)', err.message));
    }).nodeify(cb);
  });
} // API (ES6 syntax with default export)


exports.__esModule = true;
exports.default = snapshot; // For testing

exports.mappedFields = mappedFields;
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import proxyquire from 'proxyquire';
import { parseAndGetCrumb } from './yahooCrumb';
import { getFile, stubbedFor } from '../tests/testUtils';
import snapshot, { mappedFields } from './snapshot'; // for nodeify to work with stubbed out functions

import BluebirdPromise from 'bluebird';
const should = chai.should();
chai.use(sinonChai);
chai.use(chaiAsPromised);

function assertValidSnapshotResult(result) {
  /*
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      lastTradeDate: '11/15/2013',
      lastTradePriceOnly: '524.88',
      dividendYield: '2.23',
      peRatio: '13.29'
    }
  */
  result.should.be.an('object');
  result.symbol.should.be.a('string');
}

describe('snapshot', () => {
  it('throws on requesting a no-longer available field', () => {
    (function () {
      snapshot({
        symbol: 'TSLA',
        fields: ['y'
        /* available */
        , 'd'
        /* unavailable */
        ]
      });
    }).should.throw(/no longer available.*"d"/);
  });
  it('throws when no fields given without ignoreAllFieldsWarning', () => {
    (function () {
      snapshot({
        symbol: 'TSLA'
      });
    }).should.throw(/No `fields` property was given/);
  });
  it('requests correct modules for fields (sample)', async () => {
    let lastSetOpts;
    const stubbedSnapshot = proxyquire('./snapshot', {
      './yahooCrumb': {
        async getCrumb() {
          return 'crumb';
        }

      },
      './utils': {
        download: (url, opts) => {
          lastSetOpts = opts;
          return BluebirdPromise.resolve(getFile('quoteJson'));
        }
      }
    }).default;
    const samplesToTest = [{
      fields: ['s'],
      modules: ['price']
    }, {
      fields: ['a'],
      modules: ['summaryDetail']
    }, {
      fields: ['a', 's'],
      modules: ['price', 'summaryDetail']
    }];

    for (let i = 0; i < samplesToTest.length; i++) {
      const {
        fields,
        modules
      } = samplesToTest[i];
      await stubbedSnapshot({
        symbol: 'TSLA',
        fields
      });
      lastSetOpts.modules.split(',').should.be.an('array');
      lastSetOpts.modules.split(',').should.have.members(modules);
    }
  });
  const fullRes = getFile('quoteJson').quoteSummary.result[0];
  const stubbedSnapshot = proxyquire('./snapshot', stubbedFor('quoteJson')).default;
  it('maps fields', async () => {
    const result = await stubbedSnapshot({
      symbol: 'TSLA',
      // Not used, data from fixture
      fields: mappedFields // Check all mapped fields

    });
    assertValidSnapshotResult(result);
    result.should.be.an('object'); // Easy check for mismatched mappings

    Object.keys(result).forEach(key => should.exist(result[key], key)); // Questionably whether it's worth checking like this, but...

    result.symbol.should.equal(fullRes.price.symbol);
    result.name.should.equal(fullRes.price.longName);
    result.dividendYield.should.equal(fullRes.summaryDetail.dividendYield);
    result.peRatio.should.equal(fullRes.summaryDetail.trailingPE);
  });
  it('transforms array fields like c (change, percent)', async () => {
    const result = await stubbedSnapshot({
      symbol: 'TSLA',
      // Not used, data from fixture
      fields: ['c'] // Array fields

    });
    result.should.be.an('object');
    result.changeAndPercentChange.should.be.an('array');
    result.changeAndPercentChange[0].should.equal(fullRes.price.regularMarketChange);
    result.changeAndPercentChange[1].should.equal(fullRes.price.regularMarketChangePercent);
  });
  it('transforms dates', async () => {
    const result = await stubbedSnapshot({
      symbol: 'TSLA',
      // Not used, data from fixture
      fields: ['q'] // Fields with dates

    });
    result.should.be.an('object');
    result.exDividendDate.should.be.a('date');
  });
  it('supports multiple symbols', async () => {
    const download = sinon.stub().usingPromise(BluebirdPromise).resolves(getFile('quoteJson'));
    const stubbedSnapshot = proxyquire('./snapshot', {
      './yahooCrumb': {
        async getCrumb() {
          return 'crumb';
        }

      },
      './utils': {
        download
      }
    }).default;
    const result = await stubbedSnapshot({
      symbols: ['TSLA', 'MSFT'],
      fields: ['s', 'n']
    });
    download.should.have.been.calledTwice;
    download.should.have.been.calledWithMatch(/TSLA$/);
    download.should.have.been.calledWithMatch(/MSFT$/);
    result.should.be.an('object');
    result.should.include.keys('TSLA', 'MSFT');
    assertValidSnapshotResult(result.TSLA);
    assertValidSnapshotResult(result.MSFT);
  });
});
export { assertValidSnapshotResult };
module.exports = {
  s: 'Symbol',
  // Pricing
  a: 'Ask',
  b: 'Bid',
  b2: 'Ask (Realtime)',
  b3: 'Bid (Realtime)',
  p: 'Previous Close',
  o: 'Open',
  // Dividends
  y: 'Dividend Yield',
  d: 'Dividend Per Share',
  r1: 'Dividend Pay Date',
  q: 'Ex-Dividend Date',
  // Date
  c1: 'Change',
  c: 'Change And Percent Change',
  c6: 'Change (Realtime)',
  k2: 'Change Percent (Realtime)',
  p2: 'Change in Percent',
  d1: 'Last Trade Date',
  d2: 'Trade Date',
  t1: 'Last Trade Time',
  // Averages
  c8: 'After Hours Change (Realtime)',
  c3: 'Commission',
  g: 'Day’s Low',
  h: 'Day’s High',
  k1: 'Last Trade (Realtime) With Time',
  l: 'Last Trade (With Time)',
  l1: 'Last Trade (Price Only)',
  t8: '1 yr Target Price',
  m5: 'Change From 200-day Moving Average',
  m6: 'Percent Change From 200-day Moving Average',
  m7: 'Change From 50-day Moving Average',
  m8: 'Percent Change From 50-day Moving Average',
  m3: '50-day Moving Average',
  m4: '200-day Moving Average',
  // Misc
  w1: 'Day’s Value Change',
  w4: 'Day’s Value Change (Realtime)',
  p1: 'Price Paid',
  m: 'Day’s Range',
  m2: 'Day’s Range (Realtime)',
  g1: 'Holdings Gain Percent',
  g3: 'Annualized Gain',
  g4: 'Holdings Gain',
  g5: 'Holdings Gain Percent (Realtime)',
  g6: 'Holdings Gain (Realtime)',
  // 52 Week Pricing
  k: '52-week High',
  j: '52-week Low',
  j5: 'Change From 52-week Low',
  k4: 'Change From 52-week High',
  j6: 'Percent Change From 52-week Low',
  k5: 'Percebt Change From 52-week High',
  w: '52-week Range',
  // System Info
  i: 'More Info',
  j1: 'Market Capitalization',
  j3: 'Market Cap (Realtime)',
  f6: 'Float Shares',
  n: 'Name',
  n4: 'Notes',
  s1: 'Shares Owned',
  x: 'Stock Exchange',
  j2: 'Shares Outstanding',
  // Volume
  v: 'Volume',
  a5: 'Ask Size',
  b6: 'Bid Size',
  k3: 'Last Trade Size',
  a2: 'Average Daily Volume',
  // Ratio
  e: 'Earnings Per Share',
  e7: 'EPS Estimate Current Year',
  e8: 'EPS Estimate Next Year',
  e9: 'EPS Estimate Next Quarter',
  b4: 'Book Value',
  j4: 'EBITDA',
  p5: 'Price per Sales',
  p6: 'Price per Book',
  r: 'PE Ratio',
  r2: 'PE Ratio (Realtime)',
  r5: 'PEG Ratio',
  r6: 'Price Per EPS Estimate Current Year',
  r7: 'Price Per EPS Estimate Next Year',
  s7: 'Short Ratio',
  // Misc
  t7: 'Ticker Trend',
  t6: 'Trade Links',
  i5: 'Order Book (Realtime)',
  l2: 'High Limit',
  l3: 'Low Limit',
  v1: 'Holdings Value',
  v7: 'Holdings Value (Realtime)',
  s6: 'Revenue',
  e1: 'Error Indication (returned for symbol changed or invalid)',
  // Map to v10 API
  _map: {
    s: 'price.symbol',
    // 'Symbol'
    // Pricing
    a: 'summaryDetail.ask',
    // 'Ask'
    b: 'summaryDetail.bid',
    // 'Bid'
    b2: 'summaryDetail.ask',
    // 'Ask (Realtime)'
    b3: 'summaryDetail.bid',
    // 'Bid (Realtime)'
    p: 'summaryDetail.previousClose',
    // 'Previous Close'
    o: 'summaryDetail.open',
    // 'Open'
    // Dividends
    y: 'summaryDetail.dividendYield',
    // 'Dividend Yield'
    d: null,
    // 'Dividend Per Share'
    r1: null,
    // 'Dividend Pay Date'
    q: 'summaryDetail.exDividendDate',
    // 'Ex-Dividend Date'
    // Date
    c1: 'price.regularMarketChange',
    // 'Change'
    c: 'price.regularMarketChange,price.regularMarketChangePercent',
    // 'Change And Percent Change'
    c6: 'price.postMarketChange',
    // 'Change (Realtime)',
    k2: 'price.postMarketChange',
    // 'Change Percent (Realtime)',
    p2: 'price.regularMarketChangePercent',
    // 'Change in Percent',
    d1: null,
    // 'Last Trade Date'
    d2: null,
    // 'Trade Date'
    t1: null,
    // 'Last Trade Time'
    // Averages
    c8: null,
    // 'After Hours Change (Realtime)',
    c3: null,
    // 'Commission',
    g: 'summaryDetail.dayLow',
    // 'Day’s Low',
    h: 'summaryDetail.dayHigh',
    // 'Day’s High',
    k1: null,
    // 'Last Trade (Realtime) With Time',
    l: null,
    // 'Last Trade (With Time)',
    l1: null,
    // 'Last Trade (Price Only)',
    t8: null,
    // '1 yr Target Price',
    m5: null,
    // 'Change From 200-day Moving Average',
    m6: null,
    // 'Percent Change From 200-day Moving Average',
    m7: null,
    // 'Change From 50-day Moving Average',
    m8: null,
    // 'Percent Change From 50-day Moving Average',
    m3: 'summaryDetail.fiftyDayAverage',
    // '50-day Moving Average'
    m4: 'summaryDetail.twoHundredDayAverage',
    // '200-day Moving Average'
    // Misc
    w1: null,
    // 'Day’s Value Change',
    w4: null,
    // 'Day’s Value Change (Realtime)',
    p1: null,
    // 'Price Paid',
    m: null,
    // 'Day’s Range',
    m2: null,
    // 'Day’s Range (Realtime)',
    g1: null,
    // 'Holdings Gain Percent',
    g3: null,
    // 'Annualized Gain',
    g4: null,
    // 'Holdings Gain',
    g5: null,
    // 'Holdings Gain Percent (Realtime)',
    g6: null,
    // 'Holdings Gain (Realtime)',
    // 52 Week Pricing
    k: 'summaryDetail.fiftyTwoWeekHigh',
    // '52-week High',
    j: 'summaryDetail.fiftyTwoWeekLow',
    // '52-week Low',
    j5: null,
    // 'Change From 52-week Low',
    k4: null,
    // 'Change From 52-week High',
    j6: null,
    // 'Percent Change From 52-week Low',
    k5: null,
    // 'Percebt Change From 52-week High',
    w: null,
    // '52-week Range',
    // System Info
    i: null,
    // 'More Info',
    j1: null,
    // 'Market Capitalization',
    j3: null,
    // 'Market Cap (Realtime)',
    f6: null,
    // 'Float Shares',
    n: 'price.longName',
    // 'Name',
    n4: null,
    // 'Notes',
    s1: null,
    // 'Shares Owned',
    x: 'price.exchange',
    // 'Stock Exchange',
    j2: null,
    // 'Shares Outstanding',
    // Volume
    v: 'summaryDetail.volume',
    // 'Volume',
    a5: 'summaryDetail.askSize',
    // 'Ask Size',
    b6: 'summaryDetail.bidSize',
    // 'Bid Size',
    k3: null,
    // 'Last Trade Size',
    a2: 'summaryDetail.averageDailyVolume10Day',
    // 'Average Daily Volume',
    // Ratio
    e: 'defaultKeyStatistics.forwardEps',
    // 'Earnings Per Share',
    e7: null,
    // 'EPS Estimate Current Year',
    e8: null,
    // 'EPS Estimate Next Year',
    e9: null,
    // 'EPS Estimate Next Quarter',
    b4: 'defaultKeyStatistics.bookValue',
    // 'Book Value',
    j4: 'financialData.ebitda',
    // 'EBITDA',
    p5: null,
    // 'Price per Sales',
    p6: null,
    // 'Price per Book',
    r: 'summaryDetail.trailingPE',
    // 'PE Ratio',
    r2: 'summaryDetail.forwardPE',
    // 'PE Ratio (Realtime)',
    r5: 'defaultKeyStatistics.pegRatio',
    // 'PEG Ratio',
    r6: null,
    // 'Price Per EPS Estimate Current Year',
    r7: null,
    // 'Price Per EPS Estimate Next Year',
    s7: 'defaultKeyStatistics.shortRatio',
    // 'Short Ratio',
    // Misc
    t7: null,
    // 'Ticker Trend',
    t6: null,
    // 'Trade Links',
    i5: null,
    // 'Order Book (Realtime)',
    l2: null,
    // 'High Limit',
    l3: null,
    // 'Low Limit',
    v1: null,
    // 'Holdings Value',
    v7: null,
    // 'Holdings Value (Realtime)',
    s6: null,
    // 'Revenue',
    e1: null // 'Error Indication (returned for symbol changed or invalid)'

  }
};
var url = require('url');

var util = require('util');

var _ = require('lodash');

var S = require('string');

var debug = require('debug')('yahoo-finance:utils');

var request = require('request-promise');

var moment = require('moment-timezone');

var tough = require('tough-cookie');

var Cookie = tough.Cookie;
var dateFormats = ['YYYY-MM-DD', 'MM/DD/YYYY'];
var cookiejar = new request.jar();

function camelize(text) {
  return S(text).slugify().camelize().s;
}

function augmentHttpRequestOptions(optionalOptions) {
  if (optionalOptions && optionalOptions.jar) throw new Error("node-yahoo-finance does not support 'jar' key in " + "optionalHttpRequestOptions, since we need to use our own cookiejar.");
  return _.assign({}, optionalOptions, {
    resolveWithFullResponse: true,
    jar: cookiejar
  });
}

function storeCookiesInJar(setCookieHeader, url, cookiejar) {
  var cookies;

  if (typeof setCookieHeader === 'undefined') {// no-op
  } else if (setCookieHeader instanceof Array) {
    cookies = setCookieHeader.map(Cookie.parse);
  } else if (typeof setCookieHeader === 'string') {
    cookies = [Cookie.parse(setCookieHeader)];
  }

  if (cookies) for (var i = 0; i < cookies.length; i++) {
    // note: async, possible timing issues? TODO
    cookiejar.setCookie('' + cookies[i], url);
  }
}

function download(uri, qs, optionalHttpRequestOptions) {
  var finalHttpRequestOptions = augmentHttpRequestOptions(optionalHttpRequestOptions);
  debug(url.format({
    pathname: uri,
    query: qs
  }));
  return request(_.extend({
    uri: uri,
    qs: qs
  }, finalHttpRequestOptions)).then(function (res) {
    storeCookiesInJar(res.headers['set-cookie'], uri, cookiejar);
    return optionalHttpRequestOptions && optionalHttpRequestOptions.resolveWithFullResponse ? res : res.body;
  });
}

function parseCSV(text) {
  return S(text).trim().s.split('\n').map(function (line) {
    return S(line).trim().parseCSV();
  });
}

function toDate(value, valueForError) {
  try {
    var date = moment.tz(value, dateFormats, 'America/New_York').toDate();

    if (date.getFullYear() < 1400) {
      return null;
    }

    return date;
  } catch (err) {
    if (_.isUndefined(valueForError)) {
      return null;
    } else {
      return valueForError;
    }
  }
}

function toFloat(value, valueForNaN) {
  var result = parseFloat(value);

  if (isNaN(result)) {
    if (_.isUndefined(valueForNaN)) {
      return null;
    } else {
      return valueForNaN;
    }
  } else {
    return result;
  }
}

function toInt(value, valueForNaN) {
  var result = parseInt(value, 10);

  if (isNaN(result)) {
    if (_.isUndefined(valueForNaN)) {
      return null;
    } else {
      return valueForNaN;
    }
  } else {
    return result;
  }
}

exports.cookiejar = cookiejar;
exports.camelize = camelize;
exports.download = download;
exports.parseCSV = parseCSV;
exports.toDate = toDate;
exports.toFloat = toFloat;
exports.toInt = toInt;
var util = require('util');

var Promise = require('bluebird');

var _ = require('lodash');

var debug = require('debug')('yahoo-finance:yahooCrumb');

var _constants = require('./constants');

var _utils = require('./utils'); // Faster but probably more brittle option:
// var crumbRE = /"CrumbStore":\{"crumb":"(.+?)"\}/;


var dataRE = /^root.App.main = (\{.*\});$/m;

function parseAndGetCrumb(body) {
  var match = dataRE.exec(body);

  if (!match) {
    throw new Error("Could not match root.App.main line.  If this happens " + "consistently, Yahoo output has changed and you should open a bug " + "report.");
  }

  var data;

  try {
    data = JSON.parse(match[1]);
  } catch (err) {
    console.error(err);
    throw new Error("root.App.main line (or regexp) did not capture valid " + "JSON.  If this happens consistently, please open a bug report.");
  }

  var crumb;
  if (!data.context) throw new Error("root.Api.main JSON structure has changed.  If this " + "happens consistently, please open a bug report.");
  var dispatcher = data.context.dispatcher;
  crumb = dispatcher && dispatcher.stores && dispatcher.stores.CrumbStore && dispatcher.stores.CrumbStore.crumb;

  if (!crumb) {
    console.warn('root.Api.main context.dispatcher.stores.CrumbStore.crumb ' + 'structure no longer exists, please open an issue.');
    var plugins = data.context.plugins;
    crumb = plugins && plugins.ServicePlugin && plugins.ServicePlugin.xhrContext && plugins.ServicePlugin.xhrContext.crumb;
    if (!crumb) throw new Error('root.Api.main ' + 'context.plugins.ServicePlugin.xhrContext.crumb' + 'structure no longer exists, please open an issue.');
  }

  return crumb;
}

var crumb = null;
var rpOpts = {
  resolveWithFullResponse: true
};

function fetch(symbol) {
  var url = _constants.HISTORICAL_CRUMB_URL.replace(/\$SYMBOL/, symbol);

  return _utils.download(url, '', rpOpts).then(function (res) {
    crumb = parseAndGetCrumb(res.body);
    return crumb;
  }).catch(function (err) {
    throw new Error(util.format('Failed to get crumb (%s)', err.message));
  });
}

function getCrumb(symbol) {
  // Invalidate the crumb if the cookie is expired.
  if (crumb) {
    // Note: getCookies() won't return expired cookies and we rely on this.
    var cookies = _utils.cookiejar.getCookies(_constants.HISTORICAL_CRUMB_URL);

    var bCookie = _.find(cookies, {
      key: 'B'
    });

    if (!bCookie) {
      debug('No valid cookies, invalidating crumb');
      crumb = null;
    }
  }

  if (crumb) {
    debug('Returning cached crumb');
    return Promise.resolve(crumb);
  } else {
    debug('Fetching a new cookie & crumb');
    return fetch(symbol).then(function (crumb) {
      return crumb;
    });
  }
} // API


exports.getCrumb = getCrumb; // for testing

exports.parseAndGetCrumb = parseAndGetCrumb;
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import proxyquire from 'proxyquire'; // for nodeify to work with stubbed out functions

import BluebirdPromise from 'bluebird';
import tough from 'tough-cookie';
import requestPromise from 'request-promise';
import _constants from './constants';
import { parseAndGetCrumb } from './yahooCrumb';
import { getFile, STATIC_CRUMB } from '../tests/testUtils';
const Cookie = tough.Cookie;
const should = chai.should();
chai.use(chaiAsPromised);
describe('yahooCrumb', () => {
  describe('getCrumb', () => {
    it('works with current Yahoo response (2017-05-21)', () => {
      const body = getFile('historyHtml');
      const crumb = parseAndGetCrumb(body);
      crumb.should.equal(STATIC_CRUMB);
    });
    it('gets a new crumb if an existing cookie is expired', async () => {
      const cookiejar = new requestPromise.jar();
      let fileToGet;
      const getCrumb = proxyquire('./yahooCrumb', {
        './utils': {
          cookiejar,
          download: () => BluebirdPromise.resolve({
            body: getFile(fileToGet)
          })
        }
      }).getCrumb; // create an un-expired cookie

      const cookie = new Cookie({
        key: 'B',
        value: 'notImportant',
        expires: new Date(Date.now() + 10000),
        domain: 'yahoo.com',
        path: '/'
      }); // async method, but works async for the default memoryStore

      cookiejar.setCookie(cookie, _constants.HISTORICAL_CRUMB_URL);
      fileToGet = 'historyHtml';
      const initialCrumb = await getCrumb('IGNORED'); // expire the cookie

      cookie.expires = new Date(Date.now() - 5000); // async method, but works async for the default memoryStore

      cookiejar.setCookie(cookie, _constants.HISTORICAL_CRUMB_URL);
      fileToGet = 'historyHtml2';
      const nextCrumb = await getCrumb('IGNORED');
      initialCrumb.should.not.equal(nextCrumb);
    });
  });
});
/*
 * In the spec unit tests, we see if all our functions work as expected, given
 * the data they're expecting.  Here, we check if everything is working, which
 * is also testing that Yahoo is operating the same way we expect.
 */
import fs from 'fs';
import path from 'path';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import moment from 'moment';
import { assertValidHistoricalResult } from '../lib/historical.spec.js';
import { assertValidSnapshotResult } from '../lib/snapshot.spec.js';
import historical from '../lib/historical';
import snapshot from '../lib/snapshot';
const should = chai.should();
chai.use(chaiAsPromised);
const NETWORK_TIMEOUT = 10 * 1000;
const lastWeekStr = moment().subtract(7, 'days').format('YYYY-MM-DD');
if (process.env.INTEGRATION_TESTS) describe('integration tests', () => {
  describe('historical', () => {
    it('works', async () => {
      const result = await historical({
        symbol: 'TSLA',
        from: lastWeekStr
      });
      assertValidHistoricalResult(result);
    }).timeout(NETWORK_TIMEOUT);
  });
  describe('snapshot', () => {
    it('works with a single symbol', async () => {
      const result = await snapshot({
        symbol: 'MSFT',
        fields: ['s', 'y']
      });
      assertValidSnapshotResult(result);
    }).timeout(NETWORK_TIMEOUT);
    it('works with multiple symbols', async () => {
      const result = await snapshot({
        symbols: ['MSFT', 'GOOGL'],
        fields: ['s', 'p']
      });
      result.should.be.an('object');
      result.should.include.keys('GOOGL', 'MSFT');
      assertValidSnapshotResult(result.GOOGL);
      assertValidSnapshotResult(result.MSFT);
    }).timeout(NETWORK_TIMEOUT);
  });
});
import fs from 'fs';
import path from 'path'; // for nodeify to work with stubbed out functions

import BluebirdPromise from 'bluebird';

const fixturePath = (...args) => path.join('tests', 'fixtures', ...args);

const fixtures = {
  historyHtml: fixturePath('history.html'),
  // crumb: STATIC_CRUMB
  historyHtml2: fixturePath('history2.html'),
  // crumb: sxCZygzUaUK
  historyCsv: fixturePath('history_download_TSLA.csv'),
  quoteJson: fixturePath('quote_MSFT.json') // crumb: sxCZygzUaUK

};
const STATIC_CRUMB = 'zhqGa4p9aDu'; // Since the same files are used by multiple tests, but we won't already run
// all tests, this helper ensures we only load (and cache) what we need.

const fileCache = {};

function getFile(name) {
  if (fileCache[name]) return fileCache[name];
  if (!fixtures[name]) throw new Error('No fixture file: ' + name);
  fileCache[name] = fs.readFileSync(fixtures[name]).toString(); // Since we download with httpRequestOptions = { json: true };

  if (name.endsWith('Json')) fileCache[name] = JSON.parse(fileCache[name]);
  return fileCache[name];
}

const yahooCrumbStub = {
  async getCrumb() {
    return STATIC_CRUMB;
  }

};

function utilsDownloadFixture(name) {
  return {
    // async download() { return getFile(name); }
    download: () => BluebirdPromise.resolve(getFile(name))
  };
}

function stubbedFor(name) {
  return {
    './yahooCrumb': yahooCrumbStub,
    './utils': utilsDownloadFixture(name)
  };
}

export { getFile, STATIC_CRUMB, utilsDownloadFixture, stubbedFor };
