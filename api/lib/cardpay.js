// CardPay client, sandbox only for now.
// the sandbox behaves like the CardPay test environment (same request and error shape),
// it runs in process so dev and tests need no network and no key.
//
// request:  { amount (cents), currency, description, reference, billing_country, card: { number, exp_month, exp_year, cvc } }
// success:  { id: 'ch_...', status: 'succeeded', amount, currency, created }
// error:    Error with .status (400 / 402) and .code
const crypto = require('crypto');

const MODE = process.env.CARDPAY_MODE || 'sandbox';

// ISO 3166-1 alpha-2, as in the CardPay docs
const COUNTRIES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO ' +
  'JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR ' +
  'MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO ' +
  'RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV ' +
  'TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

// test cards from the CardPay docs
const TEST_CARDS = {
  '4242424242424242': null,
  '5555555555554444': null,
  '4000000000000002': { status: 402, code: 'card_declined', message: 'Your card was declined.' },
  '4000000000009995': { status: 402, code: 'insufficient_funds', message: 'Your card has insufficient funds.' },
  '4000000000000069': { status: 402, code: 'expired_card', message: 'Your card has expired.' }
};

function fail(status, code, message) {
  const err = new Error(message || code);
  err.status = status;
  err.code = code;
  return err;
}

function luhn(number) {
  let sum = 0;
  let alt = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let n = Number(number[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function validate(req) {
  if (!Number.isInteger(req.amount) || req.amount <= 0) return fail(400, 'invalid_amount', 'amount must be a positive integer (cents)');
  if (req.amount > 99999999) return fail(400, 'amount_too_large', 'amount too large');
  if (req.currency !== 'EUR') return fail(400, 'invalid_currency', 'currency not supported');
  const card = req.card || {};
  const number = String(card.number || '').replace(/\s|-/g, '');
  if (!/^\d{12,19}$/.test(number) || !luhn(number)) return fail(400, 'invalid_number', 'card number is invalid');
  const month = Number(card.exp_month);
  let year = Number(card.exp_year);
  if (year < 100) year += 2000;
  if (!(month >= 1 && month <= 12) || !year) return fail(400, 'invalid_expiry', 'expiry is invalid');
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
    return fail(402, 'expired_card', 'Your card has expired.');
  }
  if (!/^\d{3,4}$/.test(String(card.cvc || ''))) return fail(400, 'invalid_cvc', 'cvc is invalid');
  if (COUNTRIES.indexOf(req.billing_country) === -1) return fail(400, 'invalid_billing_country', 'billing_country must be ISO 3166-1 alpha-2');
  return null;
}

function sandboxCharge(req) {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      const err = validate(req);
      if (err) return reject(err);
      const number = String(req.card.number).replace(/\s|-/g, '');
      const test = TEST_CARDS[number];
      if (test) return reject(fail(test.status, test.code, test.message));
      if (test === undefined && number.indexOf('4000') === 0) {
        return reject(fail(402, 'card_declined', 'Your card was declined.'));
      }
      resolve({
        id: 'ch_' + crypto.randomBytes(12).toString('hex'),
        status: 'succeeded',
        amount: req.amount,
        currency: req.currency,
        description: req.description || null,
        reference: req.reference || null,
        last4: number.slice(-4),
        created: Math.floor(Date.now() / 1000)
      });
    });
  });
}

function charge(req) {
  if (MODE !== 'sandbox') {
    return Promise.reject(fail(500, 'not_configured', 'CardPay live mode is not set up'));
  }
  return sandboxCharge(req);
}

module.exports = { charge, COUNTRIES, TEST_CARDS, MODE };
