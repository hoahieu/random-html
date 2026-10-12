/* EMV tag dictionary and value decoders. */
(function (root) {
  'use strict';
  const QF = root.QF;
  const U = QF.util;
  const R = QF.ref;
  const { bytesToHex, bytesToText, bytesToInt } = U;

  // [tag, name, format, source]
  const TAG_LIST = [
    ['42', 'Issuer Identification Number (IIN)', 'n 6', 'ICC'],
    ['4F', 'Application Identifier (AID) – card', 'b 5-16', 'ICC'],
    ['50', 'Application Label', 'ans 1-16', 'ICC'],
    ['56', 'Track 1 Data', 'ans ..76', 'ICC'],
    ['57', 'Track 2 Equivalent Data', 'b ..19', 'ICC'],
    ['5A', 'Application Primary Account Number (PAN)', 'cn ..19', 'ICC'],
    ['5F20', 'Cardholder Name', 'ans 2-26', 'ICC'],
    ['5F24', 'Application Expiration Date', 'n 6 YYMMDD', 'ICC'],
    ['5F25', 'Application Effective Date', 'n 6 YYMMDD', 'ICC'],
    ['5F28', 'Issuer Country Code', 'n 3', 'ICC'],
    ['5F2A', 'Transaction Currency Code', 'n 3', 'Terminal'],
    ['5F2D', 'Language Preference', 'an 2-8', 'ICC'],
    ['5F30', 'Service Code', 'n 3', 'ICC'],
    ['5F34', 'Application PAN Sequence Number (PSN)', 'n 2', 'ICC'],
    ['5F36', 'Transaction Currency Exponent', 'n 1', 'Terminal'],
    ['5F50', 'Issuer URL', 'ans', 'ICC'],
    ['5F53', 'International Bank Account Number (IBAN)', 'var', 'ICC'],
    ['5F54', 'Bank Identifier Code (BIC)', 'var', 'ICC'],
    ['5F55', 'Issuer Country Code (alpha2 format)', 'a 2', 'ICC'],
    ['5F56', 'Issuer Country Code (alpha3 format)', 'a 3', 'ICC'],
    ['5F57', 'Account Type', 'n 2', 'Terminal'],
    ['61', 'Application Template', 'var', 'ICC'],
    ['6F', 'File Control Information (FCI) Template', 'var', 'ICC'],
    ['70', 'READ RECORD Response Message Template', 'var', 'ICC'],
    ['71', 'Issuer Script Template 1', 'var', 'Issuer'],
    ['72', 'Issuer Script Template 2', 'var', 'Issuer'],
    ['73', 'Directory Discretionary Template', 'var', 'ICC'],
    ['77', 'Response Message Template Format 2', 'var', 'ICC'],
    ['80', 'Response Message Template Format 1', 'var', 'ICC'],
    ['81', 'Amount, Authorised (Binary)', 'b 4', 'Terminal'],
    ['82', 'Application Interchange Profile (AIP)', 'b 2', 'ICC'],
    ['83', 'Command Template', 'b', 'Terminal'],
    ['84', 'Dedicated File (DF) Name', 'b 5-16', 'ICC'],
    ['86', 'Issuer Script Command', 'b ..261', 'Issuer'],
    ['87', 'Application Priority Indicator', 'b 1', 'ICC'],
    ['88', 'Short File Identifier (SFI)', 'b 1', 'ICC'],
    ['89', 'Authorisation Code', 'ans 6', 'Issuer'],
    ['8A', 'Authorisation Response Code (ARC)', 'an 2', 'Issuer/Terminal'],
    ['8C', 'Card Risk Management Data Object List 1 (CDOL1)', 'b ..252', 'ICC'],
    ['8D', 'Card Risk Management Data Object List 2 (CDOL2)', 'b ..252', 'ICC'],
    ['8E', 'Cardholder Verification Method (CVM) List', 'b 10-252', 'ICC'],
    ['8F', 'Certification Authority Public Key Index', 'b 1', 'ICC'],
    ['90', 'Issuer Public Key Certificate', 'b', 'ICC'],
    ['91', 'Issuer Authentication Data (IAD)', 'b 8-16', 'Issuer'],
    ['92', 'Issuer Public Key Remainder', 'b', 'ICC'],
    ['93', 'Signed Static Application Data', 'b', 'ICC'],
    ['94', 'Application File Locator (AFL)', 'var ..252', 'ICC'],
    ['95', 'Terminal Verification Results (TVR)', 'b 5', 'Terminal'],
    ['97', 'Transaction Certificate Data Object List (TDOL)', 'b ..252', 'ICC'],
    ['98', 'Transaction Certificate (TC) Hash Value', 'b 20', 'Terminal'],
    ['99', 'Transaction Personal Identification Number (PIN) Data', 'b', 'Terminal'],
    ['9A', 'Transaction Date', 'n 6 YYMMDD', 'Terminal'],
    ['9B', 'Transaction Status Information (TSI)', 'b 2', 'Terminal'],
    ['9C', 'Transaction Type', 'n 2', 'Terminal'],
    ['9D', 'Directory Definition File (DDF) Name', 'b 5-16', 'ICC'],
    ['9F01', 'Acquirer Identifier', 'n 6-11', 'Terminal'],
    ['9F02', 'Amount, Authorised (Numeric)', 'n 12', 'Terminal'],
    ['9F03', 'Amount, Other (Numeric)', 'n 12', 'Terminal'],
    ['9F04', 'Amount, Other (Binary)', 'b 4', 'Terminal'],
    ['9F05', 'Application Discretionary Data', 'b 1-32', 'ICC'],
    ['9F06', 'Application Identifier (AID) – terminal', 'b 5-16', 'Terminal'],
    ['9F07', 'Application Usage Control (AUC)', 'b 2', 'ICC'],
    ['9F08', 'Application Version Number (card)', 'b 2', 'ICC'],
    ['9F09', 'Application Version Number (terminal)', 'b 2', 'Terminal'],
    ['9F0A', 'Application Selection Registered Proprietary Data', 'b', 'ICC'],
    ['9F0B', 'Cardholder Name Extended', 'ans 27-45', 'ICC'],
    ['9F0D', 'Issuer Action Code – Default', 'b 5', 'ICC'],
    ['9F0E', 'Issuer Action Code – Denial', 'b 5', 'ICC'],
    ['9F0F', 'Issuer Action Code – Online', 'b 5', 'ICC'],
    ['9F10', 'Issuer Application Data (IAD)', 'b ..32', 'ICC'],
    ['9F11', 'Issuer Code Table Index', 'n 2', 'ICC'],
    ['9F12', 'Application Preferred Name', 'ans 1-16', 'ICC'],
    ['9F13', 'Last Online Application Transaction Counter (ATC) Register', 'b 2', 'ICC'],
    ['9F14', 'Lower Consecutive Offline Limit', 'b 1', 'ICC'],
    ['9F15', 'Merchant Category Code (MCC)', 'n 4', 'Terminal'],
    ['9F16', 'Merchant Identifier', 'ans 15', 'Terminal'],
    ['9F17', 'PIN Try Counter', 'b 1', 'ICC'],
    ['9F18', 'Issuer Script Identifier', 'b 4', 'Issuer'],
    ['9F19', 'Token Requestor ID', 'n 11', 'ICC'],
    ['9F1A', 'Terminal Country Code', 'n 3', 'Terminal'],
    ['9F1B', 'Terminal Floor Limit', 'b 4', 'Terminal'],
    ['9F1C', 'Terminal Identification', 'an 8', 'Terminal'],
    ['9F1D', 'Terminal Risk Management Data', 'b 1-8', 'Terminal'],
    ['9F1E', 'Interface Device (IFD) Serial Number', 'an 8', 'Terminal'],
    ['9F1F', 'Track 1 Discretionary Data', 'ans', 'ICC'],
    ['9F20', 'Track 2 Discretionary Data', 'cn', 'ICC'],
    ['9F21', 'Transaction Time', 'n 6 HHMMSS', 'Terminal'],
    ['9F22', 'Certification Authority Public Key Index (terminal)', 'b 1', 'Terminal'],
    ['9F23', 'Upper Consecutive Offline Limit', 'b 1', 'ICC'],
    ['9F24', 'Payment Account Reference (PAR)', 'an 29', 'ICC'],
    ['9F25', 'Last 4 Digits of PAN', 'n 4', 'ICC'],
    ['9F26', 'Application Cryptogram (AC)', 'b 8', 'ICC'],
    ['9F27', 'Cryptogram Information Data (CID)', 'b 1', 'ICC'],
    ['9F29', 'Extended Selection', 'b', 'ICC'],
    ['9F2A', 'Kernel Identifier', 'b 1-8', 'ICC'],
    ['9F2D', 'ICC PIN Encipherment Public Key Certificate', 'b', 'ICC'],
    ['9F2E', 'ICC PIN Encipherment Public Key Exponent', 'b 1/3', 'ICC'],
    ['9F2F', 'ICC PIN Encipherment Public Key Remainder', 'b', 'ICC'],
    ['9F32', 'Issuer Public Key Exponent', 'b 1/3', 'ICC'],
    ['9F33', 'Terminal Capabilities', 'b 3', 'Terminal'],
    ['9F34', 'Cardholder Verification Method (CVM) Results', 'b 3', 'Terminal'],
    ['9F35', 'Terminal Type', 'n 2', 'Terminal'],
    ['9F36', 'Application Transaction Counter (ATC)', 'b 2', 'ICC'],
    ['9F37', 'Unpredictable Number (UN)', 'b 4', 'Terminal'],
    ['9F38', 'Processing Options Data Object List (PDOL)', 'b', 'ICC'],
    ['9F39', 'Point-of-Service (POS) Entry Mode', 'n 2', 'Terminal'],
    ['9F3A', 'Amount, Reference Currency', 'b 4', 'Terminal'],
    ['9F3B', 'Application Reference Currency', 'n 3 (x1-4)', 'ICC'],
    ['9F3C', 'Transaction Reference Currency Code', 'n 3', 'Terminal'],
    ['9F3D', 'Transaction Reference Currency Exponent', 'n 1', 'Terminal'],
    ['9F40', 'Additional Terminal Capabilities', 'b 5', 'Terminal'],
    ['9F41', 'Transaction Sequence Counter', 'n 4-8', 'Terminal'],
    ['9F42', 'Application Currency Code', 'n 3', 'ICC'],
    ['9F43', 'Application Reference Currency Exponent', 'n 1 (x1-4)', 'ICC'],
    ['9F44', 'Application Currency Exponent', 'n 1', 'ICC'],
    ['9F45', 'Data Authentication Code', 'b 2', 'ICC'],
    ['9F46', 'ICC Public Key Certificate', 'b', 'ICC'],
    ['9F47', 'ICC Public Key Exponent', 'b 1/3', 'ICC'],
    ['9F48', 'ICC Public Key Remainder', 'b', 'ICC'],
    ['9F49', 'Dynamic Data Authentication Data Object List (DDOL)', 'b ..252', 'ICC'],
    ['9F4A', 'Static Data Authentication Tag List', 'var', 'ICC'],
    ['9F4B', 'Signed Dynamic Application Data', 'b', 'ICC'],
    ['9F4C', 'ICC Dynamic Number', 'b 2-8', 'ICC'],
    ['9F4D', 'Log Entry', 'b 2', 'ICC'],
    ['9F4E', 'Merchant Name and Location', 'ans', 'Terminal'],
    ['9F4F', 'Log Format', 'b', 'ICC'],
    ['9F51', 'Application Currency Code (Visa/MC proprietary)', 'n 3', 'ICC'],
    ['9F53', 'Transaction Category Code (Mastercard)', 'an 1', 'Terminal'],
    ['9F5B', 'Issuer Script Results', 'b', 'Terminal'],
    ['9F5D', 'Available Offline Spending Amount (AOSA)', 'n 12', 'ICC'],
    ['9F63', 'Offline Counter Initial Value / PUNATC(Track1)', 'b', 'ICC'],
    ['9F66', 'Terminal Transaction Qualifiers (TTQ)', 'b 4', 'Terminal'],
    ['9F67', 'NATC(Track2) / MSD Offset', 'b', 'ICC'],
    ['9F69', 'Card Authentication Related Data', 'b', 'ICC'],
    ['9F6A', 'Unpredictable Number (Numeric)', 'n 8', 'Terminal'],
    ['9F6B', 'Track 2 Data (contactless)', 'b ..19', 'ICC'],
    ['9F6C', 'Card Transaction Qualifiers (CTQ)', 'b 2', 'ICC'],
    ['9F6D', 'Mag-stripe Application Version Number (Reader)', 'b 2', 'Terminal'],
    ['9F6E', 'Form Factor Indicator (Visa) / Third Party Data (MC)', 'b', 'ICC'],
    ['9F7C', 'Customer Exclusive Data (CED)', 'b ..32', 'ICC'],
    ['A5', 'File Control Information (FCI) Proprietary Template', 'var', 'ICC'],
    ['BF0C', 'File Control Information (FCI) Issuer Discretionary Data', 'var', 'ICC'],
    ['DF8115', 'Error Indication', 'b 6', 'Kernel'],
    ['DF8129', 'Outcome Parameter Set', 'b 8', 'Kernel'],
    ['FF8105', 'Data Record', 'var', 'Kernel'],
    ['FF8106', 'Discretionary Data', 'var', 'Kernel'],
  ];

  const TAGS = {};
  for (const [tag, name, fmt, src] of TAG_LIST) TAGS[tag] = { tag, name, fmt, src };

  function lookup(tag) {
    return TAGS[tag] || null;
  }

  // ---------- bit-flag definitions (index 0 = bit 8 of the byte) ----------
  const BITS = {
    '95': [
      ['Offline data authentication was not performed', 'SDA failed', 'ICC data missing', 'Card appears on terminal exception file', 'DDA failed', 'CDA failed', 'SDA selected', null],
      ['ICC and terminal have different application versions', 'Expired application', 'Application not yet effective', 'Requested service not allowed for card product', 'New card', null, null, null],
      ['Cardholder verification was not successful', 'Unrecognised CVM', 'PIN Try Limit exceeded', 'PIN entry required and PIN pad not present or not working', 'PIN entry required, PIN pad present, but PIN was not entered', 'Online PIN entered', null, null],
      ['Transaction exceeds floor limit', 'Lower consecutive offline limit exceeded', 'Upper consecutive offline limit exceeded', 'Transaction selected randomly for online processing', 'Merchant forced transaction online', null, null, null],
      ['Default TDOL used', 'Issuer authentication failed', 'Script processing failed before final GENERATE AC', 'Script processing failed after final GENERATE AC', null, null, null, null],
    ],
    '9B': [
      ['Offline data authentication was performed', 'Cardholder verification was performed', 'Card risk management was performed', 'Issuer authentication was performed', 'Terminal risk management was performed', 'Script processing was performed', null, null],
      [null, null, null, null, null, null, null, null],
    ],
    '82': [
      [null, 'SDA supported', 'DDA supported', 'Cardholder verification is supported', 'Terminal risk management is to be performed', 'Issuer authentication is supported', 'On device cardholder verification supported', 'CDA supported'],
      ['EMV mode supported (contactless)', 'Mag-stripe mode supported (contactless)', null, null, null, null, null, 'Relay resistance protocol supported'],
    ],
    '9F33': [
      ['Manual key entry', 'Magnetic stripe', 'IC with contacts', null, null, null, null, null],
      ['Plaintext PIN for ICC verification', 'Enciphered PIN for online verification', 'Signature (paper)', 'Enciphered PIN for offline verification', 'No CVM required', null, null, null],
      ['SDA', 'DDA', 'Card capture', null, 'CDA', null, null, null],
    ],
    '9F40': [
      ['Cash', 'Goods', 'Services', 'Cashback', 'Inquiry', 'Transfer', 'Payment', 'Administrative'],
      ['Cash deposit', null, null, null, null, null, null, null],
      ['Numeric keys', 'Alphabetic and special characters keys', 'Command keys', 'Function keys', null, null, null, null],
      ['Print, attendant', 'Print, cardholder', 'Display, attendant', 'Display, cardholder', null, null, 'Code table 10', 'Code table 9'],
      ['Code table 8', 'Code table 7', 'Code table 6', 'Code table 5', 'Code table 4', 'Code table 3', 'Code table 2', 'Code table 1'],
    ],
    '9F07': [
      ['Valid for domestic cash transactions', 'Valid for international cash transactions', 'Valid for domestic goods', 'Valid for international goods', 'Valid for domestic services', 'Valid for international services', 'Valid at ATMs', 'Valid at terminals other than ATMs'],
      ['Domestic cashback allowed', 'International cashback allowed', null, null, null, null, null, null],
    ],
    '9F66': [
      ['Mag-stripe mode supported', null, 'EMV mode supported', 'EMV contact chip supported', 'Offline-only reader', 'Online PIN supported', 'Signature supported', 'Offline Data Authentication for Online Authorizations supported'],
      ['Online cryptogram required', 'CVM required', '(Contact chip) Offline PIN supported', null, null, null, null, null],
      ['Issuer Update Processing supported', 'Consumer Device CVM supported', null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
    ],
    '9F6C': [
      ['Online PIN required', 'Signature required', 'Go online if ODA fails and reader is online capable', 'Switch interface if ODA fails and reader supports contact chip', 'Go online if application expired', 'Switch interface for cash transactions', 'Switch interface for cashback transactions', null],
      ['Consumer Device CVM performed', 'Card supports Issuer Update Processing at the POS', null, null, null, null, null, null],
    ],
  };
  // Issuer Action Codes share the TVR layout
  BITS['9F0D'] = BITS['9F0E'] = BITS['9F0F'] = BITS['95'];

  function decodeBits(defs, v) {
    const lines = [];
    for (let i = 0; i < v.length; i++) {
      for (let j = 0; j < 8; j++) {
        if (v[i] & (0x80 >> j)) {
          const name = defs[i] && defs[i][j];
          lines.push(`B${i + 1} b${8 - j}: ${name || 'RFU'}`);
        }
      }
    }
    return { text: lines.length ? `${lines.length} bit(s) set` : 'No bits set', lines };
  }

  // ---------- lookups ----------
  const TXN_TYPES = {
    '00': 'Purchase',
    '01': 'Cash withdrawal',
    '09': 'Purchase with cashback',
    '17': 'Cash disbursement',
    '20': 'Refund',
    '21': 'Deposit',
    '28': 'Payment / credit',
    '30': 'Balance inquiry',
    '31': 'Balance inquiry',
    '40': 'Transfer',
  };

  const TERMINAL_TYPES = {
    '11': 'Financial institution, attended, online only',
    '12': 'Financial institution, attended, offline with online capability',
    '13': 'Financial institution, attended, offline only',
    '14': 'Financial institution, unattended, online only',
    '15': 'Financial institution, unattended, offline with online capability',
    '16': 'Financial institution, unattended, offline only',
    '21': 'Merchant, attended, online only',
    '22': 'Merchant, attended, offline with online capability',
    '23': 'Merchant, attended, offline only',
    '24': 'Merchant, unattended, online only',
    '25': 'Merchant, unattended, offline with online capability',
    '26': 'Merchant, unattended, offline only',
    '34': 'Cardholder, unattended, online only',
    '35': 'Cardholder, unattended, offline with online capability',
    '36': 'Cardholder, unattended, offline only',
  };

  const CVM_METHODS = {
    0x00: 'Fail CVM processing',
    0x01: 'Plaintext PIN verification performed by ICC',
    0x02: 'Enciphered PIN verified online',
    0x03: 'Plaintext PIN verification by ICC and signature (paper)',
    0x04: 'Enciphered PIN verification performed by ICC',
    0x05: 'Enciphered PIN verification by ICC and signature (paper)',
    0x1e: 'Signature (paper)',
    0x1f: 'No CVM required',
    0x3f: 'No CVM performed',
  };

  const CVM_CONDITIONS = {
    0x00: 'Always',
    0x01: 'If unattended cash',
    0x02: 'If not unattended cash and not manual cash and not purchase with cashback',
    0x03: 'If terminal supports the CVM',
    0x04: 'If manual cash',
    0x05: 'If purchase with cashback',
    0x06: 'If transaction is in the application currency and is under X value',
    0x07: 'If transaction is in the application currency and is over X value',
    0x08: 'If transaction is in the application currency and is under Y value',
    0x09: 'If transaction is in the application currency and is over Y value',
  };

  const CVM_RESULTS = { 0x00: 'Unknown', 0x01: 'Failed', 0x02: 'Successful' };

  function cvmMethod(b) {
    const m = b & 0x3f;
    if (CVM_METHODS[m]) return CVM_METHODS[m];
    if (m >= 0x20 && m <= 0x2f) return 'Payment system specific CVM';
    if (m >= 0x30 && m <= 0x3e) return 'Issuer specific CVM';
    return 'RFU';
  }

  const RIDS = {
    A000000003: 'Visa',
    A000000004: 'Mastercard',
    A000000025: 'American Express',
    A000000065: 'JCB',
    A000000152: 'Discover',
    A000000324: 'Discover',
    A000000333: 'UnionPay',
    A000000277: 'Interac',
    A000000524: 'RuPay',
    A000000658: 'Mir',
  };

  const AIDS = {
    A0000000031010: 'Visa Credit/Debit',
    A0000000032010: 'Visa Electron',
    A0000000033010: 'Visa Interlink',
    A0000000038010: 'Visa Plus',
    A0000000041010: 'Mastercard Credit/Debit',
    A0000000043060: 'Maestro',
    A0000000046000: 'Cirrus',
    A00000002501: 'American Express',
    A0000000651010: 'JCB',
    A0000001523010: 'Discover',
    A000000333010101: 'UnionPay Debit',
    A000000333010102: 'UnionPay Credit',
  };

  // ---------- decoders ----------
  const D = {};
  const hexOf = (v) => bytesToHex(v);

  function digits(v) {
    const h = hexOf(v);
    return /^\d*$/.test(h) ? h : null;
  }

  function date6(v) {
    const h = digits(v);
    if (!h || h.length !== 6) return null;
    return { text: `20${h.slice(0, 2)}-${h.slice(2, 4)}-${h.slice(4, 6)}` };
  }

  function amountExp(ctx) {
    if (ctx['5F36'] && /^\d+$/.test(ctx['5F36'])) return parseInt(ctx['5F36'], 10);
    if (ctx['5F2A']) {
      const e = R.currencyExp(ctx['5F2A']);
      if (e != null) return e;
    }
    return null;
  }

  function amountText(minorDigits, ctx) {
    const exp = amountExp(ctx);
    const cur = ctx['5F2A'] ? R.currencyAlpha(ctx['5F2A']) : null;
    if (exp == null) return { text: `${U.formatAmount(minorDigits, 0)} (minor units)` };
    return { text: `${U.formatAmount(minorDigits, exp)}${cur ? ' ' + cur : ''}` };
  }

  const numAmount = (v, ctx) => {
    const h = digits(v);
    return h == null ? null : amountText(h, ctx);
  };
  const binAmount = (v, ctx) => amountText(String(bytesToInt(v)), ctx);
  const intValue = (v) => ({ text: String(bytesToInt(v)) });
  const currency = (v) => {
    const h = digits(v);
    return h ? { text: R.currencyText(h) || h } : null;
  };
  const country = (v) => {
    const h = digits(v);
    return h ? { text: R.countryText(h) || h } : null;
  };
  const ascii = (v) => ({ text: bytesToText(v) });

  D['9F02'] = D['9F03'] = D['9F5D'] = numAmount;
  D['81'] = D['9F04'] = D['9F1B'] = D['9F3A'] = binAmount;
  D['9F36'] = D['9F13'] = D['9F17'] = D['9F14'] = D['9F23'] = intValue;
  D['5F2A'] = D['9F42'] = D['9F3C'] = D['9F51'] = currency;
  D['5F28'] = D['9F1A'] = country;
  D['9A'] = D['5F24'] = D['5F25'] = date6;

  D['9F21'] = (v) => {
    const h = digits(v);
    return h && h.length === 6 ? { text: `${h.slice(0, 2)}:${h.slice(2, 4)}:${h.slice(4, 6)}` } : null;
  };

  D['5A'] = (v) => ({ text: hexOf(v).replace(/F+$/, '') });
  D['57'] = D['9F6B'] = (v) => U.parseTrack2(hexOf(v));

  D['9C'] = (v) => {
    const h = hexOf(v);
    return { text: TXN_TYPES[h] ? `${h} ${TXN_TYPES[h]}` : h };
  };

  D['9F35'] = (v) => {
    const h = hexOf(v);
    return { text: TERMINAL_TYPES[h] || h };
  };

  D['9F39'] = (v) => {
    const h = hexOf(v);
    return { text: R.panEntryModes[h] ? `${h} ${R.panEntryModes[h]}` : h };
  };

  D['9F15'] = (v) => {
    const h = hexOf(v);
    return { text: R.mcc[h] ? `${h} ${R.mcc[h]}` : h };
  };

  D['8A'] = (v) => {
    const t = bytesToText(v);
    return { text: R.responseCodes[t] ? `${t} ${R.responseCodes[t]}` : t };
  };

  D['5F2D'] = (v) => {
    const t = bytesToText(v);
    return { text: (t.match(/.{1,2}/g) || []).join(', ') };
  };

  D['5F34'] = D['9F41'] = D['5F36'] = D['9F44'] = D['9F11'] = (v) => {
    const h = digits(v);
    return h != null ? { text: String(parseInt(h || '0', 10)) } : null;
  };

  for (const t of ['50', '9F12', '5F20', '9F16', '9F1C', '9F1E', '9F4E', '89', '9F0B', '5F50', '56', '9F1F', '5F55', '5F56', '9F24', '9F53']) {
    D[t] = ascii;
  }

  for (const t of Object.keys(BITS)) D[t] = (v) => decodeBits(BITS[t], v);

  D['4F'] = D['84'] = D['9F06'] = (v) => {
    const h = hexOf(v);
    const name = AIDS[h] || RIDS[h.slice(0, 10)];
    return name ? { text: name } : null;
  };

  D['9F27'] = (v) => {
    const b = v[0];
    const type = ['AAC (transaction declined)', 'TC (transaction approved)', 'ARQC (online authorisation requested)', 'RFU'][b >> 6];
    const lines = [];
    if (b & 0x08) lines.push('Advice required');
    const reason = { 0: 'No information given', 1: 'Service not allowed', 2: 'PIN Try Limit exceeded', 3: 'Issuer authentication failed' }[b & 7];
    lines.push(`Reason/advice code: ${reason || 'RFU'}`);
    return { text: type, lines };
  };

  D['9F34'] = (v) => {
    if (v.length !== 3) return null;
    const method = cvmMethod(v[0]);
    const cond = CVM_CONDITIONS[v[1]] || 'RFU / payment-system specific';
    const result = CVM_RESULTS[v[2]] || 'RFU';
    return { text: `${method} · ${result}`, lines: [`CVM performed: ${method}`, `Condition: ${cond}`, `Result: ${result}`] };
  };

  D['8E'] = (v) => {
    if (v.length < 8) return null;
    const lines = [`Amount X: ${bytesToInt(v.subarray(0, 4))}`, `Amount Y: ${bytesToInt(v.subarray(4, 8))}`];
    for (let i = 8; i + 1 < v.length; i += 2) {
      const c = v[i];
      lines.push(
        `${U.byteHex(c)}${U.byteHex(v[i + 1])}: ${cvmMethod(c)} — ${CVM_CONDITIONS[v[i + 1]] || 'RFU'}` +
          (c & 0x40 ? ' (apply next rule if this fails)' : ' (fail cardholder verification if unsuccessful)')
      );
    }
    return { text: `${(v.length - 8) >> 1} CV rule(s)`, lines };
  };

  D['94'] = (v) => {
    const lines = [];
    for (let i = 0; i + 3 < v.length; i += 4) {
      lines.push(`SFI ${v[i] >> 3}: records ${v[i + 1]}–${v[i + 2]}, ${v[i + 3]} for offline data authentication`);
    }
    return { text: `${lines.length} entr${lines.length === 1 ? 'y' : 'ies'}`, lines };
  };

  function decodeDOL(v) {
    const lines = [];
    let p = 0;
    try {
      while (p < v.length) {
        const t = QF.tlv.readTag(v, p, v.length);
        p += t.length;
        if (p >= v.length) throw new Error('truncated');
        const l = v[p++];
        const def = TAGS[t.tag];
        lines.push(`${t.tag} [${l}] ${def ? def.name : 'Unknown tag'}`);
      }
    } catch (e) {
      lines.push('… malformed DOL');
    }
    return { text: `${lines.length} data object(s) requested`, lines };
  }
  D['9F38'] = D['8C'] = D['8D'] = D['97'] = D['9F49'] = decodeDOL;

  D['9F09'] = D['9F08'] = D['9F6D'] = (v) => ({ text: `Version ${hexOf(v)}` });

  /** Collect primitive tag values for context-aware decoding (e.g. amounts need the currency). */
  function context(nodes) {
    const ctx = {};
    QF.tlv.walk(nodes, (n) => {
      if (n.type === 'tlv' && !n.constructed && !(n.tag in ctx)) ctx[n.tag] = bytesToHex(n.value);
    });
    return ctx;
  }

  function decode(node, ctx = {}) {
    if (node.type !== 'tlv' || node.constructed || node.text) return null;
    const v = node.value;
    if (!v.length) return null;
    const fn = D[node.tag];
    if (fn) {
      try {
        const r = fn(v, ctx);
        if (r) return r;
      } catch (e) {
        /* fall through to generic */
      }
    }
    const def = TAGS[node.tag];
    if (!def) return U.countNonPrintable(v) === 0 && v.length > 1 ? { text: `"${bytesToText(v)}"`, guess: true } : null;
    const f = def.fmt;
    if (/^(a|an|ans)\b/.test(f)) return ascii(v);
    if (/^cn\b/.test(f)) return { text: hexOf(v).replace(/F+$/, '') };
    if (/^n\b/.test(f)) {
      const h = digits(v);
      return h != null ? { text: h } : null;
    }
    return null;
  }

  QF.emv = { TAGS, TAG_LIST, lookup, decode, context, BITS };
})(typeof window !== 'undefined' ? window : globalThis);
