let time_units = ['second', 'minute', 'hour', 'day', 'month', 'year'];

let timeSubUnits = {
  minute: [60, 'second'],
  hour: [60, 'minute'],
  day: [24, 'hour'],
  month: [30, 'day'],
  year: [12, 'month'],
};

function toSeconds(amount, unit) {
  let current = unit;

  while (timeSubUnits[current]) {
    const [factor, next] = timeSubUnits[current];
    amount *= factor;
    current = next;
  }

  return amount; // now in seconds
}

function fromSeconds(seconds, targetUnit) {
  let stack = [];

  // rebuild chain upward (seconds → ... → year)
  let reverseMap = {};

  for (let key in timeSubUnits) {
    const [factor, next] = timeSubUnits[key];
    reverseMap[next] = key;
  }

  let unit = 'second';
  while (reverseMap[unit]) {
    unit = reverseMap[unit];
    stack.push(unit);
  }

  let currentUnit = 'second';
  let value = seconds;

  for (let i = 0; i < stack.length; i++) {
    const nextUnit = stack[i];
    const factor = timeSubUnits[nextUnit][0];

    if (currentUnit === targetUnit) break;

    if (nextUnit === targetUnit) {
      return value / factor;
    }

    if (currentUnit === 'second' && nextUnit === targetUnit) {
      return value / factor;
    }

    if (currentUnit === 'second') {
      value = value;
      currentUnit = nextUnit;
    }
  }

  // fallback simple conversion
  let current = 'year';
  let value2 = seconds;

  const order = ['year', 'month', 'day', 'hour', 'minute', 'second'];

  for (let i = order.length - 1; i >= 0; i--) {
    const unit = order[i];

    if (unit === targetUnit) {
      return value2;
    }

    if (timeSubUnits[unit]) {
      const [factor] = timeSubUnits[unit];
      value2 /= factor;
    }
  }

  return seconds;
}

function convertTime(amount, fromTimeUnit, toTimeUnit) {
  if (fromTimeUnit === toTimeUnit) return amount;

  // 1) convert to seconds
  let seconds = toSeconds(amount, fromTimeUnit);

  // 2) convert from seconds to target
  const order = ['year', 'month', 'day', 'hour', 'minute', 'second'];

  let factors = {
    second: 1,
    minute: 60,
    hour: 60 * 60,
    day: 24 * 60 * 60,
    month: 30 * 24 * 60 * 60,
    year: 12 * 30 * 24 * 60 * 60,
  };

  return seconds / factors[toTimeUnit];
}



function seperateTime(amount, fromTimeUnit) {
  let seconds = toSeconds(amount, fromTimeUnit);

  const units = [
    ['year', 12 * 30 * 24 * 60 * 60],
    ['month', 30 * 24 * 60 * 60],
    ['day', 24 * 60 * 60],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1],
  ];

  let result = {};

  for (let [unit, value] of units) {
    if (seconds >= value) {
      result[unit] = Math.floor(seconds / value);
      seconds = seconds % value;
    }
  }

  return result;
}


export { time_units, convertTime,seperateTime };