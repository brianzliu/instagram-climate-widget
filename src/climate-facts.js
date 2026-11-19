export const SHORT_TRIP_MILES = 3;
export const US_SHORT_TRIP_SHARE = 52;
export const MAX_TRIP_MILES = 25000;

export const climateFacts = [
  {
    id: 'travel', label: 'Short trips', action: ['trip', 'trips'],
    title: 'Trips under 3 miles',
    source: 'U.S. Department of Energy · 2021 travel data',
    url: 'https://www.energy.gov/cmei/vehicles/articles/fotw-1230-march-21-2022-more-half-all-daily-trips-were-less-three-miles-2021',
    note: 'The U.S. figure covers all modes of travel. Your share uses only journal trips with a distance.',
  },
  {
    id: 'plant', label: 'Plant-based meals', action: ['plant-based meal', 'plant-based meals'],
    title: 'Estimated emissions of entire diets in a UK study',
    bars: [['Vegan diets', 25.1], ['High-meat diets (reference)', 100]],
    source: 'Scarborough et al. · Nature Food, 2023',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10365988/',
    note: 'High-meat diets contained at least 100 g of meat per day. The vegan group estimate was 25.1% of the reference, with a 95% uncertainty interval of 15.1–37.0%. The study compared diets across groups.',
  },
  {
    id: 'leftovers', label: 'Food waste', action: ['leftover meal', 'leftover meals'],
    title: 'Methane released by U.S. municipal solid waste landfills in 2020',
    bars: [['From discarded food', 58], ['From other waste', 42]],
    source: 'U.S. EPA · Food waste methane report, 2023',
    url: 'https://www.epa.gov/system/files/documents/2023-10/food-waste-landfill-methane-10-8-23-final_508-compliant.pdf',
    note: 'The EPA estimated the share of methane that escaped into the atmosphere.',
  },
  {
    id: 'recycling', label: 'Recycling', action: ['recycling action', 'recycling actions'],
    title: 'Where U.S. municipal solid waste went in 2018',
    bars: [['Recycled', 23.6], ['Landfilled', 50]],
    source: 'U.S. EPA · 2018 materials and waste fact sheet',
    url: 'https://www.epa.gov/sites/default/files/2021-01/documents/2018_ff_fact_sheet_dec_2020_fnl_508.pdf',
    note: 'Percentages are by weight. The remaining share went to composting, combustion with energy recovery, or other food management.',
  },
  {
    id: 'electronics', label: 'Electronics', action: ['electronics action', 'electronics actions'],
    title: 'Documented collection and recycling of global e-waste in 2022',
    bars: [['Documented as formally collected and recycled', 22.3]],
    source: 'ITU and UNITAR · Global E-waste Monitor 2024',
    url: 'https://www.itu.int/en/ITU-D/Environment/Pages/Publications/The-Global-E-waste-Monitor-2024.aspx',
    note: 'The percentage is measured by weight across the world’s discarded electronics.',
  },
];

const topicIds = new Set(climateFacts.map(fact => fact.id));
const presets = new Map([
  ['bus', 'travel'], ['walk', 'travel'], ['bike', 'travel'], ['plant', 'plant'],
  ['leftovers', 'leftovers'], ['recycle', 'recycling'],
]);

export function comparisonTopic(action) {
  return action.comparisonTopic ?? presets.get(action.kind) ?? '';
}

function validTripMiles(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_TRIP_MILES;
}

export function comparisonDetails(action, topic, tripMiles, { strict = false } = {}) {
  const validTopic = topic === '' || topicIds.has(topic);
  if (strict && topic !== undefined && !validTopic) throw new Error('Choose a comparison from the list.');
  const details = validTopic ? { comparisonTopic: topic } : {};
  if (comparisonTopic({ kind: action.kind, ...details }) === 'travel' && tripMiles != null) {
    if (validTripMiles(tripMiles)) details.tripMiles = tripMiles;
    else if (strict) throw new Error('Enter a distance above 0 and up to 25,000 miles.');
  }
  return details;
}

export function summarizeComparisons(actions) {
  return climateFacts.flatMap(fact => {
    const matching = actions.filter(action => comparisonTopic(action) === fact.id);
    if (!matching.length) return [];
    if (fact.id !== 'travel') return [{ ...fact, count: matching.length }];
    const measured = matching.filter(action => validTripMiles(action.tripMiles));
    const short = measured.filter(action => action.tripMiles < SHORT_TRIP_MILES).length;
    return [{
      ...fact, count: matching.length, measured: measured.length, short,
      bars: [...(measured.length ? [['Your trips with a distance', 100 * short / measured.length]] : []),
        ['All U.S. trips in 2021 (estimate)', US_SHORT_TRIP_SHARE]],
    }];
  });
}
