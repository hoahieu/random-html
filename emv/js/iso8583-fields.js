/*
 * ISO 8583:1987 data element definitions.
 * [id, type, var, maxLen, name]
 *   type: n numeric | z track 2 | b binary | xn C/D sign + numeric | a/an/ans/ns text
 *   var:  0 fixed, 2 LLVAR, 3 LLLVAR
 *   len:  digits for n/z/xn, bytes for b, characters otherwise
 */
(function (root) {
  'use strict';
  const QF = root.QF;

  const LIST = [
    [1, 'b', 0, 8, 'Secondary bitmap'],
    [2, 'n', 2, 19, 'Primary account number (PAN)'],
    [3, 'n', 0, 6, 'Processing code'],
    [4, 'n', 0, 12, 'Amount, transaction'],
    [5, 'n', 0, 12, 'Amount, settlement'],
    [6, 'n', 0, 12, 'Amount, cardholder billing'],
    [7, 'n', 0, 10, 'Transmission date & time'],
    [8, 'n', 0, 8, 'Amount, cardholder billing fee'],
    [9, 'n', 0, 8, 'Conversion rate, settlement'],
    [10, 'n', 0, 8, 'Conversion rate, cardholder billing'],
    [11, 'n', 0, 6, 'System trace audit number (STAN)'],
    [12, 'n', 0, 6, 'Time, local transaction (hhmmss)'],
    [13, 'n', 0, 4, 'Date, local transaction (MMDD)'],
    [14, 'n', 0, 4, 'Date, expiration (YYMM)'],
    [15, 'n', 0, 4, 'Date, settlement (MMDD)'],
    [16, 'n', 0, 4, 'Date, conversion (MMDD)'],
    [17, 'n', 0, 4, 'Date, capture (MMDD)'],
    [18, 'n', 0, 4, 'Merchant type (MCC)'],
    [19, 'n', 0, 3, 'Acquiring institution country code'],
    [20, 'n', 0, 3, 'PAN extended, country code'],
    [21, 'n', 0, 3, 'Forwarding institution country code'],
    [22, 'n', 0, 3, 'Point of service entry mode'],
    [23, 'n', 0, 3, 'Application PAN sequence number'],
    [24, 'n', 0, 3, 'Function code / Network international identifier (NII)'],
    [25, 'n', 0, 2, 'Point of service condition code'],
    [26, 'n', 0, 2, 'Point of service capture code'],
    [27, 'n', 0, 1, 'Authorizing identification response length'],
    [28, 'xn', 0, 8, 'Amount, transaction fee'],
    [29, 'xn', 0, 8, 'Amount, settlement fee'],
    [30, 'xn', 0, 8, 'Amount, transaction processing fee'],
    [31, 'xn', 0, 8, 'Amount, settlement processing fee'],
    [32, 'n', 2, 11, 'Acquiring institution identification code'],
    [33, 'n', 2, 11, 'Forwarding institution identification code'],
    [34, 'ns', 2, 28, 'Primary account number, extended'],
    [35, 'z', 2, 37, 'Track 2 data'],
    [36, 'n', 3, 104, 'Track 3 data'],
    [37, 'an', 0, 12, 'Retrieval reference number'],
    [38, 'an', 0, 6, 'Authorization identification response'],
    [39, 'an', 0, 2, 'Response code'],
    [40, 'an', 0, 3, 'Service restriction code'],
    [41, 'ans', 0, 8, 'Card acceptor terminal identification'],
    [42, 'ans', 0, 15, 'Card acceptor identification code'],
    [43, 'ans', 0, 40, 'Card acceptor name/location'],
    [44, 'an', 2, 25, 'Additional response data'],
    [45, 'an', 2, 76, 'Track 1 data'],
    [46, 'an', 3, 999, 'Additional data (ISO)'],
    [47, 'an', 3, 999, 'Additional data (national)'],
    [48, 'an', 3, 999, 'Additional data (private)'],
    [49, 'an', 0, 3, 'Currency code, transaction'],
    [50, 'an', 0, 3, 'Currency code, settlement'],
    [51, 'an', 0, 3, 'Currency code, cardholder billing'],
    [52, 'b', 0, 8, 'Personal identification number data (PIN block)'],
    [53, 'n', 0, 16, 'Security related control information'],
    [54, 'an', 3, 120, 'Additional amounts'],
    [55, 'b', 3, 999, 'ICC data – EMV having multiple tags'],
    [56, 'ans', 3, 999, 'Reserved (ISO)'],
    [57, 'ans', 3, 999, 'Reserved (national)'],
    [58, 'ans', 3, 999, 'Reserved (national)'],
    [59, 'ans', 3, 999, 'Reserved (national)'],
    [60, 'ans', 3, 999, 'Reserved (national)'],
    [61, 'ans', 3, 999, 'Reserved (private)'],
    [62, 'ans', 3, 999, 'Reserved (private)'],
    [63, 'ans', 3, 999, 'Reserved (private)'],
    [64, 'b', 0, 8, 'Message authentication code (MAC)'],
    [65, 'b', 0, 8, 'Extended bitmap indicator'],
    [66, 'n', 0, 1, 'Settlement code'],
    [67, 'n', 0, 2, 'Extended payment code'],
    [68, 'n', 0, 3, 'Receiving institution country code'],
    [69, 'n', 0, 3, 'Settlement institution country code'],
    [70, 'n', 0, 3, 'Network management information code'],
    [71, 'n', 0, 4, 'Message number'],
    [72, 'n', 0, 4, 'Last message number'],
    [73, 'n', 0, 6, 'Action date (YYMMDD)'],
    [74, 'n', 0, 10, 'Number of credits'],
    [75, 'n', 0, 10, 'Credits, reversal number'],
    [76, 'n', 0, 10, 'Number of debits'],
    [77, 'n', 0, 10, 'Debits, reversal number'],
    [78, 'n', 0, 10, 'Transfer number'],
    [79, 'n', 0, 10, 'Transfer, reversal number'],
    [80, 'n', 0, 10, 'Number of inquiries'],
    [81, 'n', 0, 10, 'Number of authorizations'],
    [82, 'n', 0, 12, 'Credits, processing fee amount'],
    [83, 'n', 0, 12, 'Credits, transaction fee amount'],
    [84, 'n', 0, 12, 'Debits, processing fee amount'],
    [85, 'n', 0, 12, 'Debits, transaction fee amount'],
    [86, 'n', 0, 16, 'Total amount of credits'],
    [87, 'n', 0, 16, 'Credits, reversal amount'],
    [88, 'n', 0, 16, 'Total amount of debits'],
    [89, 'n', 0, 16, 'Debits, reversal amount'],
    [90, 'n', 0, 42, 'Original data elements'],
    [91, 'an', 0, 1, 'File update code'],
    [92, 'an', 0, 2, 'File security code'],
    [93, 'an', 0, 5, 'Response indicator'],
    [94, 'an', 0, 7, 'Service indicator'],
    [95, 'an', 0, 42, 'Replacement amounts'],
    [96, 'b', 0, 8, 'Message security code'],
    [97, 'xn', 0, 16, 'Net settlement amount'],
    [98, 'ans', 0, 25, 'Payee'],
    [99, 'n', 2, 11, 'Settlement institution identification code'],
    [100, 'n', 2, 11, 'Receiving institution identification code'],
    [101, 'ans', 2, 17, 'File name'],
    [102, 'ans', 2, 28, 'Account identification 1'],
    [103, 'ans', 2, 28, 'Account identification 2'],
    [104, 'ans', 3, 100, 'Transaction description'],
  ];
  for (let i = 105; i <= 111; i++) LIST.push([i, 'ans', 3, 999, 'Reserved for ISO use']);
  for (let i = 112; i <= 119; i++) LIST.push([i, 'ans', 3, 999, 'Reserved for national use']);
  for (let i = 120; i <= 127; i++) LIST.push([i, 'ans', 3, 999, 'Reserved for private use']);
  LIST.push([128, 'b', 0, 8, 'Message authentication code (MAC)']);

  const FIELDS = {};
  for (const [id, type, v, len, name] of LIST) FIELDS[id] = { id, type, var: v, len, name, tlv: id === 55 };

  QF.isoFields = FIELDS;

  // ISO 8583:1993 — only the elements whose format differs from 1987
  const LIST_1993 = [
    [12, 'n', 0, 12, 'Date and time, local transaction (YYMMDDhhmmss)'],
    [13, 'n', 0, 4, 'Date, effective (YYMM)'],
    [22, 'an', 0, 12, 'Point of service data code'],
    [24, 'n', 0, 3, 'Function code'],
    [25, 'n', 0, 4, 'Message reason code'],
    [26, 'n', 0, 4, 'Card acceptor business code'],
    [27, 'n', 0, 1, 'Approval code length'],
    [28, 'n', 0, 6, 'Date, reconciliation (YYMMDD)'],
    [29, 'n', 0, 3, 'Reconciliation indicator'],
    [30, 'n', 0, 24, 'Amounts, original'],
    [31, 'ans', 2, 99, 'Acquirer reference data'],
    [39, 'n', 0, 3, 'Action code'],
    [40, 'n', 0, 3, 'Service code'],
    [43, 'ans', 2, 99, 'Card acceptor name/location'],
    [44, 'ans', 2, 99, 'Additional response data'],
    [46, 'ans', 3, 204, 'Amounts, fees'],
    [53, 'b', 2, 48, 'Security related control information'],
    [54, 'ans', 3, 120, 'Amounts, additional'],
    [55, 'b', 3, 255, 'ICC system related data'],
    [56, 'n', 2, 35, 'Original data elements'],
    [57, 'n', 0, 3, 'Authorization life cycle code'],
    [58, 'n', 2, 11, 'Authorizing agent institution identification code'],
    [59, 'ans', 3, 999, 'Transport data'],
  ];
  const FIELDS_1993 = {};
  for (const [id, type, v, len, name] of LIST_1993) FIELDS_1993[id] = { id, type, var: v, len, name, tlv: id === 55 };

  QF.isoFields1993 = FIELDS_1993;
})(typeof window !== 'undefined' ? window : globalThis);
