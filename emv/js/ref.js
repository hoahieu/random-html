/* Reference tables shared by the ISO 8583 and EMV decoders. */
(function (root) {
  'use strict';
  const QF = root.QF;

  // ISO 4217 numeric -> [alpha, name, minor unit exponent]
  const currencies = {
    '036': ['AUD', 'Australian Dollar', 2],
    '048': ['BHD', 'Bahraini Dinar', 3],
    '050': ['BDT', 'Taka', 2],
    '096': ['BND', 'Brunei Dollar', 2],
    '116': ['KHR', 'Riel', 2],
    '124': ['CAD', 'Canadian Dollar', 2],
    '156': ['CNY', 'Yuan Renminbi', 2],
    '208': ['DKK', 'Danish Krone', 2],
    '344': ['HKD', 'Hong Kong Dollar', 2],
    '356': ['INR', 'Indian Rupee', 2],
    '360': ['IDR', 'Rupiah', 2],
    '376': ['ILS', 'New Israeli Sheqel', 2],
    '392': ['JPY', 'Yen', 0],
    '410': ['KRW', 'Won', 0],
    '414': ['KWD', 'Kuwaiti Dinar', 3],
    '418': ['LAK', 'Lao Kip', 2],
    '458': ['MYR', 'Malaysian Ringgit', 2],
    '484': ['MXN', 'Mexican Peso', 2],
    '512': ['OMR', 'Rial Omani', 3],
    '554': ['NZD', 'New Zealand Dollar', 2],
    '578': ['NOK', 'Norwegian Krone', 2],
    '586': ['PKR', 'Pakistan Rupee', 2],
    '608': ['PHP', 'Philippine Peso', 2],
    '634': ['QAR', 'Qatari Rial', 2],
    '643': ['RUB', 'Russian Ruble', 2],
    '682': ['SAR', 'Saudi Riyal', 2],
    '702': ['SGD', 'Singapore Dollar', 2],
    '704': ['VND', 'Dong', 0],
    '710': ['ZAR', 'Rand', 2],
    '752': ['SEK', 'Swedish Krona', 2],
    '756': ['CHF', 'Swiss Franc', 2],
    '764': ['THB', 'Baht', 2],
    '784': ['AED', 'UAE Dirham', 2],
    '818': ['EGP', 'Egyptian Pound', 2],
    '826': ['GBP', 'Pound Sterling', 2],
    '840': ['USD', 'US Dollar', 2],
    '901': ['TWD', 'New Taiwan Dollar', 2],
    '949': ['TRY', 'Turkish Lira', 2],
    '978': ['EUR', 'Euro', 2],
    '985': ['PLN', 'Zloty', 2],
    '986': ['BRL', 'Brazilian Real', 2],
  };

  // ISO 3166-1 numeric -> name
  const countries = {
    '036': 'Australia',
    '076': 'Brazil',
    '096': 'Brunei Darussalam',
    '116': 'Cambodia',
    '124': 'Canada',
    '156': 'China',
    '158': 'Taiwan',
    '208': 'Denmark',
    '250': 'France',
    '276': 'Germany',
    '344': 'Hong Kong',
    '356': 'India',
    '360': 'Indonesia',
    '372': 'Ireland',
    '376': 'Israel',
    '380': 'Italy',
    '392': 'Japan',
    '410': 'Korea, Republic of',
    '418': 'Lao PDR',
    '458': 'Malaysia',
    '484': 'Mexico',
    '528': 'Netherlands',
    '554': 'New Zealand',
    '578': 'Norway',
    '608': 'Philippines',
    '616': 'Poland',
    '643': 'Russian Federation',
    '682': 'Saudi Arabia',
    '702': 'Singapore',
    '704': 'Viet Nam',
    '710': 'South Africa',
    '724': 'Spain',
    '752': 'Sweden',
    '756': 'Switzerland',
    '764': 'Thailand',
    '784': 'United Arab Emirates',
    '792': 'Türkiye',
    '826': 'United Kingdom',
    '840': 'United States',
  };

  const responseCodes = {
    '00': 'Approved',
    '01': 'Refer to card issuer',
    '02': 'Refer to card issuer, special condition',
    '03': 'Invalid merchant',
    '04': 'Pick up card',
    '05': 'Do not honour',
    '06': 'Error',
    '07': 'Pick up card, special condition',
    '08': 'Honour with identification',
    '10': 'Approved for partial amount',
    '11': 'Approved (VIP)',
    '12': 'Invalid transaction',
    '13': 'Invalid amount',
    '14': 'Invalid card number',
    '15': 'No such issuer',
    '19': 'Re-enter transaction',
    '21': 'No action taken',
    '25': 'Unable to locate record',
    '30': 'Format error',
    '41': 'Lost card, pick up',
    '43': 'Stolen card, pick up',
    '51': 'Insufficient funds',
    '54': 'Expired card',
    '55': 'Incorrect PIN',
    '57': 'Transaction not permitted to cardholder',
    '58': 'Transaction not permitted to terminal',
    '59': 'Suspected fraud',
    '61': 'Exceeds withdrawal amount limit',
    '62': 'Restricted card',
    '63': 'Security violation',
    '65': 'Exceeds withdrawal frequency limit',
    '68': 'Response received too late',
    '75': 'Allowable number of PIN tries exceeded',
    '76': 'Invalid / non-existent account',
    '78': 'Blocked, first used',
    '85': 'No reason to decline',
    '91': 'Issuer or switch inoperative',
    '92': 'Financial institution cannot be found for routing',
    '94': 'Duplicate transmission',
    '96': 'System malfunction',
    // EMV offline Authorisation Response Codes (tag 8A)
    Y1: 'Offline approved',
    Z1: 'Offline declined',
    Y2: 'Approved after card-initiated referral',
    Z2: 'Declined after card-initiated referral',
    Y3: 'Unable to go online, offline approved',
    Z3: 'Unable to go online, offline declined',
  };

  const processingTypes = {
    '00': 'Purchase (goods and services)',
    '01': 'Cash withdrawal',
    '02': 'Debit adjustment',
    '09': 'Purchase with cashback',
    '11': 'Quasi-cash',
    '17': 'Cash advance',
    '20': 'Refund / return',
    '21': 'Deposit',
    '22': 'Credit adjustment',
    '28': 'Payment / credit',
    '30': 'Available funds inquiry',
    '31': 'Balance inquiry',
    '40': 'Cardholder accounts transfer',
    '50': 'Bill payment',
    '90': 'PIN change',
    '91': 'PIN unblock',
  };

  const accountTypes = {
    '00': 'Default / unspecified',
    '10': 'Savings',
    '20': 'Checking',
    '30': 'Credit',
    '40': 'Universal',
  };

  const panEntryModes = {
    '00': 'Unknown',
    '01': 'Manual (key entry)',
    '02': 'Magnetic stripe (track data may be incomplete)',
    '03': 'Bar code',
    '05': 'Integrated circuit card (contact chip)',
    '07': 'Contactless chip (EMV)',
    '10': 'Credential on file',
    '79': 'Chip read failed, PAN entered manually',
    '80': 'Fallback: chip unreadable, magnetic stripe read',
    '81': 'E-commerce',
    '90': 'Magnetic stripe (full track data)',
    '91': 'Contactless magnetic stripe',
    '95': 'Chip, CVV may be unreliable',
  };

  const pinEntryCaps = {
    '0': 'Unspecified',
    '1': 'Terminal can accept PINs',
    '2': 'Terminal cannot accept PINs',
    '8': 'PIN pad inoperative',
    '9': 'Reserved',
  };

  const posConditionCodes = {
    '00': 'Normal presentment',
    '01': 'Customer not present',
    '02': 'Unattended terminal able to retain card',
    '03': 'Merchant suspicious',
    '05': 'Customer present, card not present',
    '06': 'Pre-authorised request',
    '08': 'Mail / telephone order',
    '10': 'Customer identity verified',
    '51': 'Request for account number verification',
    '59': 'E-commerce',
    '71': 'Card present, magnetic stripe unreadable',
  };

  const networkMgmtCodes = {
    '001': 'Sign-on',
    '002': 'Sign-off',
    '101': 'Key exchange',
    '161': 'Key change',
    '201': 'Cutover',
    '301': 'Echo test',
  };

  const mcc = {
    '4111': 'Local/suburban commuter transport',
    '4121': 'Taxicabs / limousines',
    '4814': 'Telecommunication services',
    '4900': 'Utilities',
    '5311': 'Department stores',
    '5411': 'Grocery stores, supermarkets',
    '5499': 'Misc. food stores',
    '5541': 'Service stations',
    '5812': 'Eating places, restaurants',
    '5814': 'Fast food restaurants',
    '5912': 'Drug stores, pharmacies',
    '5999': 'Misc. and specialty retail',
    '6010': 'Manual cash disbursements',
    '6011': 'Automated cash disbursements (ATM)',
    '6012': 'Financial institutions, merchandise and services',
    '7011': 'Lodging, hotels, motels',
    '7832': 'Motion picture theaters',
  };

  function currencyText(code) {
    const c = String(code).replace(/^0(?=\d{3}$)/, '');
    const e = currencies[c];
    return e ? `${c} ${e[0]} (${e[1]})` : null;
  }

  function currencyExp(code) {
    const c = String(code).replace(/^0(?=\d{3}$)/, '');
    return currencies[c] ? currencies[c][2] : null;
  }

  function currencyAlpha(code) {
    const c = String(code).replace(/^0(?=\d{3}$)/, '');
    return currencies[c] ? currencies[c][0] : null;
  }

  function countryText(code) {
    const c = String(code).replace(/^0(?=\d{3}$)/, '');
    return countries[c] ? `${c} ${countries[c]}` : null;
  }

  QF.ref = {
    currencies,
    countries,
    responseCodes,
    processingTypes,
    accountTypes,
    panEntryModes,
    pinEntryCaps,
    posConditionCodes,
    networkMgmtCodes,
    mcc,
    currencyText,
    currencyExp,
    currencyAlpha,
    countryText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
