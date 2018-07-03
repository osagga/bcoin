/*!
 * address.js - address object for bcoin
 * Copyright (c) 2014-2015, Fedor Indutny (MIT License)
 * Copyright (c) 2014-2017, Christopher Jeffrey (MIT License).
 * https://github.com/bcoin-org/bcoin
 */

'use strict';

const assert = require('assert');
const Network = require('../protocol/network');
const encoding = require('../utils/encoding');
const util = require('../utils/util');
const digest = require('../crypto/digest');
const BufferReader = require('../utils/reader');
const StaticWriter = require('../utils/staticwriter');
const {base58, cashaddr} = require('bstring');

/**
 * Represents an address.
 * @alias module:primitives.Address
 * @constructor
 * @param {Object?} options
 * @property {Buffer} hash
 * @property {AddressPrefix} type
 * @property {Number} version
 * @property {Network} network
 */

function Address(options) {
  if (!(this instanceof Address))
    return new Address(options);

  this.hash = encoding.ZERO_HASH160;
  this.type = Address.types.PUBKEYHASH;
  this.version = -1;
  this.network = Network.primary;

  if (options)
    this.fromOptions(options);
}

/**
 * Address types.
 * @enum {Number}
 */

Address.types = {
  PUBKEYHASH: 0,
  SCRIPTHASH: 1
};

/**
 * Address types by value.
 * @const {RevMap}
 */

Address.typesByVal = util.revMap(Address.types);

/**
 * Inject properties from options object.
 * @private
 * @param {Object} options
 */

Address.prototype.fromOptions = function fromOptions(options) {
  if (typeof options === 'string')
    return this.fromString(options);

  return this.fromHash(
    options.hash,
    options.type,
    options.version,
    options.network
  );
};

/**
 * Insantiate address from options.
 * @param {Object} options
 * @returns {Address}
 */

Address.fromOptions = function fromOptions(options) {
  return new Address().fromOptions(options);
};

/**
 * Get the address hash.
 * @param {String?} enc - Can be `"hex"` or `null`.
 * @returns {Hash|Buffer}
 */

Address.prototype.getHash = function getHash(enc) {
  if (enc === 'hex')
    return this.hash.toString(enc);
  return this.hash;
};

/**
 * Test whether the address is null.
 * @returns {Boolean}
 */

Address.prototype.isNull = function isNull() {
  if (this.hash.length === 20)
    return this.hash.equals(encoding.ZERO_HASH160);

  if (this.hash.length === 32)
    return this.hash.equals(encoding.ZERO_HASH);

  for (let i = 0; i < this.hash.length; i++) {
    if (this.hash[i] !== 0)
      return false;
  }

  return true;
};

/**
 * Get the address type as a string.
 * @returns {String}
 */

Address.prototype.getType = function getType() {
  return Address.typesByVal[this.type].toLowerCase();
};

/**
 * Get a network address prefix for the address.
 * @param {Network?} network
 * @returns {Number}
 */

Address.prototype.getPrefix = function getPrefix(network) {
    network = Network.get(network);

    const prefixes = network.addressPrefix;

    switch (this.type) {
      case Address.types.PUBKEYHASH:
        return prefixes.pubkeyhash;
      case Address.types.SCRIPTHASH:
        return prefixes.scripthash;
    }

    return -1;
};

/**
 * Calculate size of serialized address.
 * @returns {Number}
 */

Address.prototype.getSize = function getSize() {
  let size = 5 + this.hash.length;

  if (this.version !== -1)
    size += 2;

  return size;
};

/**
 * Compile the address object to its raw serialization.
 * @param {{NetworkType|Network)?} network
 * @returns {Buffer}
 * @throws Error on bad hash/prefix.
 */

Address.prototype.toRaw = function toRaw(network) {
  let size = this.getSize();
  let bw = new StaticWriter(size);
  let prefix = this.getPrefix(network);

  assert(prefix !== -1, 'Not a valid address prefix.');

  bw.writeU8(prefix);

  if (this.version !== -1) {
    bw.writeU8(this.version);
    bw.writeU8(0);
  }

  bw.writeBytes(this.hash);
  bw.writeChecksum();

  return bw.render();
};

/**
 * Compile the address object to a base58 address.
 * @param {{NetworkType|Network)?} network
 * @returns {Base58Address}
 * @throws Error on bad hash/prefix.
 */

Address.prototype.toBase58 = function toBase58(network) {
  return base58.encode(this.toRaw(network));
};

/**
 * Compile the address object to a cashaddr address.
 * @param {{NetworkType|Network)?} network
 * @returns {String}
 * @throws Error on bad hash/prefix.
 */

Address.prototype.toCashAddr = function toCashAddr(network) {
    const type = this.type;
    const hash = this.hash;

    network = Network.get(network);

    const prefix = network.addressPrefix.cashaddr;

    return cashaddr.encode(prefix, type, hash);
};

/**
   * Inject properties from cashaddr address.
   * @private
   * @param {String} data
   * @param {Network?} network
   * @throws Parse error
*/

Address.prototype.fromCashAddr = function fromCashAddr(data, network) {
    assert(typeof data === 'string');

    network = Network.get(network);

    const prefix = network.addressPrefix.cashaddr;
    const addr = cashaddr.decode(data, prefix);

    Network.fromCashAddr(addr.prefix, network);

    return this.fromHash(addr.hash, addr.type);
};


// /**
//    * Create an address object from a cashaddr address.
//    * @param {String} data
//    * @param {Network?} network
//    * @returns {Address}
//    * @throws Parse error.
// */

//   static fromCashAddr(data, network) {
//     return new this().fromCashAddr(data, network);
//   }


/**
 * Inject properties from string.
 * @private
 * @param {String} addr
 * @param {(Network|NetworkType)?} network
 * @returns {Address}
 */

Address.prototype.fromString = function fromString(addr, network){
    assert(typeof addr === 'string');
    assert(addr.length > 0);
    assert(addr.length <= 100);

    // If the address is mixed case,
    // it can only ever be base58.
    if (util.isMixedCase(addr))
      return this.fromBase58(addr, network);

    // Otherwise, it's most likely cashaddr.
    try {
      return this.fromCashAddr(addr, network);
    } catch (e) {
      return this.fromBase58(addr, network);
    }
};

/**
 * Inject properties from string.
 * @private
 * @param {String} addr
 * @param {(Network|NetworkType)?} network
 * @returns {Address}
 */

Address.prototype.fromString = function fromString(addr, network) {
    return new this().fromString(addr, network);
};

/**
 * Return cashaddr by default
 * @param {(Network|NetworkType)?} network
 * @returns {AddressString}
 */

Address.prototype.toString = function toString(network) {
    return this.toCashAddr(network);
}

/**
 * Instantiate address from string.
 * @param {String} addr
 * @param {(Network|NetworkType)?} network
 * @returns {Address}
 */

Address.fromString = function fromString(addr, network) {
  return new Address().fromString(addr, network);
};

/**
 * Inspect the Address.
 * @returns {Object}
 */

Address.prototype.inspect = function inspect() {
  return '<Address:'
    + ` type=${this.getType()}`
    + ` version=${this.version}`
    + ` str=${this.toString()}`
    + '>';
};

/**
 * Inject properties from serialized data.
 * @private
 * @param {Buffer} data
 * @throws Parse error
 */

Address.prototype.fromRaw = function fromRaw(data, network) {
  let br = new BufferReader(data, true);
  let version = -1;
  let prefix, type, hash;

  if (data.length > 40)
    throw new Error('Address is too long.');

  prefix = br.readU8();
  network = Network.fromAddress(prefix, network);
  type = Address.getType(prefix, network);

  if (data.length > 25) {
    version = br.readU8();

    if (br.readU8() !== 0)
      throw new Error('Address version padding is non-zero.');
  }

  hash = br.readBytes(br.left() - 4);

  br.verifyChecksum();

  return this.fromHash(hash, type, version, network);
};

/**
 * Create an address object from a serialized address.
 * @param {Buffer} data
 * @returns {Address}
 * @throws Parse error.
 */

Address.fromRaw = function fromRaw(data, network) {
  return new Address().fromRaw(data, network);
};

/**
 * Inject properties from base58 address.
 * @private
 * @param {Base58Address} data
 * @param {Network?} network
 * @throws Parse error
 */

Address.prototype.fromBase58 = function fromBase58(data, network) {
  assert(typeof data === 'string');

  if (data.length > 55)
    throw new Error('Address is too long.');

  return this.fromRaw(base58.decode(data), network);
};

/**
 * Create an address object from a base58 address.
 * @param {Base58Address} data
 * @param {Network?} network
 * @returns {Address}
 * @throws Parse error.
 */

Address.fromBase58 = function fromBase58(data, network) {
  return new Address().fromBase58(data, network);
};

/**
 * Inject properties from bech32 address.
 * @private
 * @param {String} data
 * @param {Network?} network
 * @throws Parse error
 */

Address.prototype.fromBech32 = function fromBech32(data, network) {
  let type = Address.types.WITNESS;
  let addr;

  assert(typeof data === 'string');

  addr = bech32.decode(data);
  network = Network.fromBech32(addr.hrp, network);

  return this.fromHash(addr.hash, type, addr.version, network);
};

/**
 * Create an address object from a bech32 address.
 * @param {String} data
 * @param {Network?} network
 * @returns {Address}
 * @throws Parse error.
 */

Address.fromBech32 = function fromBech32(data, network) {
  return new Address().fromBech32(data, network);
};

/**
 * Inject properties from output script.
 * @private
 * @param {Script} script
 */

Address.prototype.fromScript = function fromScript(script) {
  if (script.isPubkey()) {
    this.hash = digest.hash160(script.get(0));
    this.type = Address.types.PUBKEYHASH;
    this.version = -1;
    return this;
  }

  if (script.isPubkeyhash()) {
    this.hash = script.get(2);
    this.type = Address.types.PUBKEYHASH;
    this.version = -1;
    return this;
  }

  if (script.isScripthash()) {
    this.hash = script.get(1);
    this.type = Address.types.SCRIPTHASH;
    this.version = -1;
    return this;
  }

  // Put this last: it's the slowest to check.
  if (script.isMultisig()) {
    this.hash = script.hash160();
    this.type = Address.types.SCRIPTHASH;
    this.version = -1;
    return this;
  }
};

/**
 * Inject properties from input script.
 * @private
 * @param {Script} script
 */

Address.prototype.fromInputScript = function fromInputScript(script) {
  if (script.isPubkeyhashInput()) {
    this.hash = digest.hash160(script.get(1));
    this.type = Address.types.PUBKEYHASH;
    this.version = -1;
    return this;
  }

  if (script.isScripthashInput()) {
    this.hash = digest.hash160(script.get(script.length - 1));
    this.type = Address.types.SCRIPTHASH;
    this.version = -1;
    return this;
  }
};

/**
 * Create an Address from an input script.
 * Attempt to extract address
 * properties from an input script.
 * @param {Script}
 * @returns {Address|null}
 */

Address.fromInputScript = function fromInputScript(script) {
  return new Address().fromInputScript(script);
};

/**
 * Create an Address from an output script.
 * Parse an output script and extract address
 * properties. Converts pubkey and multisig
 * scripts to pubkeyhash and scripthash addresses.
 * @param {Script}
 * @returns {Address|null}
 */

Address.fromScript = function fromScript(script) {
  return new Address().fromScript(script);
};


/**
 * Inject properties from a hash.
 * @private
 * @param {Buffer|Hash} hash
 * @param {AddressPrefix} type
 * @throws on bad hash size
 */

Address.prototype.fromHash = function fromHash(hash, type, version, network) {
    if (typeof hash === 'string')
    hash = Buffer.from(hash, 'hex');

  if (typeof type === 'string') {
    type = Address.types[type.toUpperCase()];
    assert(type != null, 'Not a valid address type.');
  }

  if (type == null)
    type = Address.types.PUBKEYHASH;

  assert(Buffer.isBuffer(hash));
  assert((type >>> 0) === type);

  assert(type >= Address.types.PUBKEYHASH && type <= Address.types.SCRIPTHASH,
    'Not a valid address type.');

  assert(hash.length === 20, 'Hash is the wrong size.');

  this.hash = hash;
  this.type = type;

  return this;
};

/**
 * Create a naked address from hash/type/version.
 * @param {Hash} hash
 * @param {AddressPrefix} type
 * @param {Number} [version=-1]
 * @param {(Network|NetworkType)?} network
 * @returns {Address}
 * @throws on bad hash size
 */

Address.fromHash = function fromHash(hash, type, version, network) {
  return new Address().fromHash(hash, type, version, network);
};

/**
 * Inject properties from pubkeyhash.
 * @private
 * @param {Buffer} hash
 * @param {Network?} network
 * @returns {Address}
 */

Address.prototype.fromPubkeyhash = function fromPubkeyhash(hash, network) {
  let type = Address.types.PUBKEYHASH;
  assert(hash.length === 20, 'P2PKH must be 20 bytes.');
  return this.fromHash(hash, type, -1, network);
};

/**
 * Instantiate address from pubkeyhash.
 * @param {Buffer} hash
 * @param {Network?} network
 * @returns {Address}
 */

Address.fromPubkeyhash = function fromPubkeyhash(hash, network) {
  return new Address().fromPubkeyhash(hash, network);
};

/**
 * Inject properties from scripthash.
 * @private
 * @param {Buffer} hash
 * @param {Network?} network
 * @returns {Address}
 */

Address.prototype.fromScripthash = function fromScripthash(hash, network) {
  let type = Address.types.SCRIPTHASH;
  assert(hash && hash.length === 20, 'P2SH must be 20 bytes.');
  return this.fromHash(hash, type, -1, network);
};

/**
 * Instantiate address from scripthash.
 * @param {Buffer} hash
 * @param {Network?} network
 * @returns {Address}
 */

Address.fromScripthash = function fromScripthash(hash, network) {
  return new Address().fromScripthash(hash, network);
};

/**
 * Inject properties from witness pubkeyhash.
 * @private
 * @param {Buffer} hash
 * @param {Network?} network
 * @returns {Address}
 */

Address.prototype.fromWitnessPubkeyhash = function fromWitnessPubkeyhash(hash, network) {
  let type = Address.types.WITNESS;
  assert(hash && hash.length === 20, 'P2WPKH must be 20 bytes.');
  return this.fromHash(hash, type, 0, network);
};

/**
 * Instantiate address from witness pubkeyhash.
 * @param {Buffer} hash
 * @param {Network?} network
 * @returns {Address}
 */

Address.fromWitnessPubkeyhash = function fromWitnessPubkeyhash(hash, network) {
  return new Address().fromWitnessPubkeyhash(hash, network);
};

/**
 * Inject properties from witness scripthash.
 * @private
 * @param {Buffer} hash
 * @param {Network?} network
 * @returns {Address}
 */

Address.prototype.fromWitnessScripthash = function fromWitnessScripthash(hash, network) {
  let type = Address.types.WITNESS;
  assert(hash && hash.length === 32, 'P2WPKH must be 32 bytes.');
  return this.fromHash(hash, type, 0, network);
};

/**
 * Instantiate address from witness scripthash.
 * @param {Buffer} hash
 * @param {Network?} network
 * @returns {Address}
 */

Address.fromWitnessScripthash = function fromWitnessScripthash(hash, network) {
  return new Address().fromWitnessScripthash(hash, network);
};

/**
 * Inject properties from witness program.
 * @private
 * @param {Number} version
 * @param {Buffer} hash
 * @param {Network?} network
 * @returns {Address}
 */

Address.prototype.fromProgram = function fromProgram(version, hash, network) {
  let type = Address.types.WITNESS;

  assert(version >= 0, 'Bad version for witness program.');

  if (typeof hash === 'string')
    hash = Buffer.from(hash, 'hex');

  return this.fromHash(hash, type, version, network);
};

/**
 * Instantiate address from witness program.
 * @param {Number} version
 * @param {Buffer} hash
 * @param {Network?} network
 * @returns {Address}
 */

Address.fromProgram = function fromProgram(version, hash, network) {
  return new Address().fromProgram(version, hash, network);
};

/**
 * Test whether the address is pubkeyhash.
 * @returns {Boolean}
 */

Address.prototype.isPubkeyhash = function isPubkeyhash() {
  return this.type === Address.types.PUBKEYHASH;
};

/**
 * Test whether the address is scripthash.
 * @returns {Boolean}
 */

Address.prototype.isScripthash = function isScripthash() {
  return this.type === Address.types.SCRIPTHASH;
};

/**
 * Test whether the address is witness pubkeyhash.
 * @returns {Boolean}
 */

Address.prototype.isWitnessPubkeyhash = function isWitnessPubkeyhash() {
  return this.version === 0 && this.hash.length === 20;
};

/**
 * Test whether the address is witness scripthash.
 * @returns {Boolean}
 */

Address.prototype.isWitnessScripthash = function isWitnessScripthash() {
  return this.version === 0 && this.hash.length === 32;
};

/**
 * Test whether the address is witness masthash.
 * @returns {Boolean}
 */

Address.prototype.isWitnessMasthash = function isWitnessMasthash() {
  return this.version === 1 && this.hash.length === 32;
};

/**
 * Test whether the address is a witness program.
 * @returns {Boolean}
 */

Address.prototype.isProgram = function isProgram() {
  return this.version !== -1;
};

/**
 * Test whether the address is an unknown witness program.
 * @returns {Boolean}
 */

Address.prototype.isUnknown = function isUnknown() {
  if (this.version === -1)
    return false;

  if (this.version > 0)
    return true;

  return this.hash.length !== 20 && this.hash.length !== 32;
};

/**
 * Get the hash of a base58 address or address-related object.
 * @param {String|Address|Hash} data
 * @param {String?} enc
 * @param {Network?} network
 * @returns {Hash}
 */

Address.getHash = function getHash(data, enc, network) {
  let hash;

  if (!data)
    throw new Error('Object is not an address.');

  if (typeof data === 'string') {
    if (data.length === 40 || data.length === 64)
      return enc === 'hex' ? data : Buffer.from(data, 'hex');

    hash = Address.fromString(data, network).hash;
  } else if (Buffer.isBuffer(data)) {
    if (data.length !== 20 && data.length !== 32)
      throw new Error('Object is not an address.');
    hash = data;
  } else if (data instanceof Address) {
    hash = data.hash;
    if (network) {
      network = Network.get(network);
      if (data.network !== network)
        throw new Error('Network mismatch for address.');
    }
  } else {
    throw new Error('Object is not an address.');
  }

  return enc === 'hex'
    ? hash.toString('hex')
    : hash;
};

/**
 * Get an address type for a specified network address prefix.
 * @param {Number} prefix
 * @param {Network} network
 * @returns {AddressType}
 */

Address.getType = function getType(prefix, network) {
  let prefixes = network.addressPrefix;
  switch (prefix) {
    case prefixes.pubkeyhash:
      return Address.types.PUBKEYHASH;
    case prefixes.scripthash:
      return Address.types.SCRIPTHASH;
    case prefixes.witnesspubkeyhash:
    case prefixes.witnessscripthash:
      return Address.types.WITNESS;
    default:
      throw new Error('Unknown address prefix.');
  }
};

/*
 * Expose
 */

module.exports = Address;
