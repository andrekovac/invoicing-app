// tax math. rate is always in percent here (19, 7, 0)

var RATES = [19, 7, 0];

function gross(net, rate) {
  return net * (1 + rate / 100);
}

function net(grossAmount, rate) {
  return grossAmount / (1 + rate / 100);
}

function taxAmount(netAmount, rate) {
  return gross(netAmount, rate) - netAmount;
}

function lineTotal(quantity, unitPrice) {
  return Number(quantity) * Number(unitPrice);
}

function sumItems(items) {
  return (items || []).reduce(function (sum, it) {
    return sum + lineTotal(it.quantity, it.unit_price);
  }, 0);
}

function isValidRate(rate) {
  return RATES.indexOf(Number(rate)) !== -1;
}

module.exports = {
  RATES: RATES,
  gross: gross,
  net: net,
  taxAmount: taxAmount,
  lineTotal: lineTotal,
  sumItems: sumItems,
  isValidRate: isValidRate
};
