const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  classifyCustomer,
  buildCrmSnapshot,
  parisWeekKeys,
  SEGMENTS,
  effectiveStage,
  parsePersonInput,
  cleanNote,
  cleanTaskTitle,
  buildPersonFile,
  groupPipeline,
} = require('../lib/crm');

const NOW = new Date('2026-10-17T12:00:00Z');

function daysAgo(n) {
  return new Date(NOW.getTime() - n * 86400000).toISOString();
}

describe('classifyCustomer', () => {
  it('priorise un gain encore à honorer', () => {
    assert.equal(classifyCustomer({
      created_at: daysAgo(40),
      last_spin_at: daysAgo(2),
      spin_count: 4,
      pending_count: 1,
    }, NOW), 'pending');
  });

  it('marque habitué un client actif avec au moins deux tirages', () => {
    assert.equal(classifyCustomer({
      created_at: daysAgo(40),
      last_spin_at: daysAgo(6),
      spin_count: 2,
      pending_count: 0,
    }, NOW), 'regular');
  });

  it('marque nouveau un inscrit de moins de 14 jours sans gain en attente', () => {
    assert.equal(classifyCustomer({
      created_at: daysAgo(3),
      last_spin_at: daysAgo(3),
      spin_count: 1,
      pending_count: 0,
    }, NOW), 'new');
  });

  it('marque dormant sans visite depuis plus de 30 jours', () => {
    assert.equal(classifyCustomer({
      created_at: daysAgo(60),
      last_spin_at: daysAgo(40),
      spin_count: 3,
      pending_count: 0,
    }, NOW), 'dormant');
  });

  it('marque une seule visite récente hors fenêtre nouveau', () => {
    assert.equal(classifyCustomer({
      created_at: daysAgo(20),
      last_spin_at: daysAgo(5),
      spin_count: 1,
      pending_count: 0,
    }, NOW), 'once');
  });
});

describe('buildCrmSnapshot', () => {
  it('agrège les KPI, comble les semaines vides et trie les fiches récentes', () => {
    const snapshot = buildCrmSnapshot({
      now: NOW,
      restaurant: { id: 4, name: 'Le Zinc' },
      weekly: [{ week: '2026-10-12', customers: 2 }],
      prizes: [{ name: 'Café', wins: 4, redeemed: 1 }],
      customers: [
        {
          id: 1, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@ex.fr', phone: '0600000000',
          restaurant_name: 'Le Zinc', created_at: daysAgo(3), last_spin_at: daysAgo(3),
          spin_count: 1, win_count: 1, redeemed_count: 0, pending_count: 1,
        },
        {
          id: 2, first_name: 'Alan', last_name: 'Turing', email: 'alan@ex.fr', phone: '',
          restaurant_name: 'Le Zinc', created_at: daysAgo(50), last_spin_at: daysAgo(4),
          spin_count: 3, win_count: 2, redeemed_count: 2, pending_count: 0,
        },
      ],
    });

    assert.equal(snapshot.restaurant.name, 'Le Zinc');
    assert.equal(snapshot.kpis.customers, 2);
    assert.equal(snapshot.kpis.new_30d, 1);
    assert.equal(snapshot.kpis.returning, 1);
    assert.equal(snapshot.kpis.pending, 1);
    assert.equal(snapshot.kpis.with_phone, 1);
    assert.equal(snapshot.kpis.wins, 3);
    assert.equal(snapshot.kpis.redeemed, 2);
    assert.equal(snapshot.kpis.redemption_rate, 2 / 3);
    assert.deepEqual(snapshot.segments.map((s) => s.key), SEGMENTS);
    assert.equal(snapshot.segments.reduce((sum, s) => sum + s.count, 0), 2);
    assert.equal(snapshot.weekly.length, 8);
    assert.equal(snapshot.weekly.at(-1).week, '2026-10-12');
    assert.equal(snapshot.weekly.at(-1).customers, 2);
    assert.equal(snapshot.weekly[0].customers, 0);
    assert.equal(snapshot.recent[0].name, 'Ada Lovelace');
    assert.equal(snapshot.recent[0].segment, 'pending');
    assert.equal(snapshot.recent[1].segment, 'regular');
    assert.equal(snapshot.prizes[0].redemption_rate, 0.25);
  });

  it('aligne les semaines sur le lundi de Paris', () => {
    const weeks = parisWeekKeys(8, NOW);
    assert.equal(weeks.length, 8);
    assert.equal(weeks.at(-1), '2026-10-12');
    for (const week of weeks) {
      assert.equal(new Date(`${week}T00:00:00Z`).getUTCDay(), 1);
    }
  });
});

describe('fiche et pipeline', () => {
  it('garde une étape choisie et sinon calcule le segment', () => {
    assert.equal(effectiveStage({
      crm_stage: 'dormant',
      pending_count: 2,
      created_at: daysAgo(1),
      spin_count: 1,
    }, NOW), 'dormant');
    assert.equal(effectiveStage({
      crm_stage: 'ailleurs',
      pending_count: 1,
      created_at: daysAgo(1),
    }, NOW), 'pending');
  });

  it('refuse une fiche incomplète et accepte une fiche complète', () => {
    assert.equal(parsePersonInput({ first_name: 'Ada' }, { creating: true }).error, 'Le nom est requis.');
    const parsed = parsePersonInput({
      first_name: '  Ada ',
      last_name: 'Lovelace',
      email: 'Ada@Ex.fr',
      phone: '06 00',
      restaurant_id: '4',
      stage: 'regular',
    }, { creating: true });
    assert.deepEqual(parsed.value, {
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: 'ada@ex.fr',
      phone: '06 00',
      restaurant_id: 4,
      crm_stage: 'regular',
    });
  });

  it('revient au calcul automatique quand l’étape est vide', () => {
    const parsed = parsePersonInput({ stage: 'auto' });
    assert.equal(parsed.value.crm_stage, null);
    assert.equal(parsePersonInput({ stage: 'nope' }).error, 'Cette étape n’existe pas.');
  });

  it('nettoie les notes et les tâches', () => {
    assert.equal(cleanNote('   '), null);
    assert.equal(cleanNote('bonjour   toi'), 'bonjour toi');
    assert.equal(cleanNote('a'.repeat(2001)).length, 2000);
    assert.equal(cleanTaskTitle(''), null);
    assert.equal(cleanTaskTitle('x'.repeat(200)).length, 180);
  });

  it('assemble la fiche et range le pipeline', () => {
    const file = buildPersonFile({
      customer: {
        id: 3, first_name: 'Ada', last_name: 'Lovelace', email: 'ada@ex.fr',
        restaurant_id: 4, restaurant_name: 'Le Zinc', crm_stage: 'regular',
        spin_count: 2, pending_count: 0, note_count: 1, open_tasks: 1,
      },
      notes: [{ id: 1, body: 'Aime le café', created_at: '2026-10-01' }],
      tasks: [{ id: 2, title: 'Rappeler', done: 0 }],
      spins: [{ id: 9, prize_name: 'Café', won_at: '2026-10-02', used: 1 }],
    });
    assert.equal(file.person.stage, 'regular');
    assert.equal(file.person.stage_manual, true);
    assert.equal(file.notes[0].body, 'Aime le café');
    assert.equal(file.tasks[0].done, false);
    assert.equal(file.spins[0].prize, 'Café');
    assert.equal(file.spins[0].used, true);
    const board = groupPipeline([
      { stage: 'new' },
      { stage: 'regular' },
      { stage: 'regular' },
    ]);
    assert.deepEqual(board.map((column) => column.people.length), [1, 0, 2, 0, 0]);
  });
});

describe('CRM super-admin seulement', () => {
  it('expose la route super-admin et la page, pas le dashboard restaurant', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    const sa = fs.readFileSync(path.join(__dirname, '../public/superadmin/index.html'), 'utf8');
    const workspace = fs.readFileSync(path.join(__dirname, '../public/js/crm-workspace.js'), 'utf8');
    const admin = fs.readFileSync(path.join(__dirname, '../public/admin/index.html'), 'utf8');
    assert.match(server, /\/api\/superadmin\/crm\/people/);
    assert.match(server, /crm_notes/);
    assert.match(server, /crm_tasks/);
    assert.match(sa, /id="page-crm"/);
    assert.match(sa, /id="crm-board"/);
    assert.match(sa, /id="crm-drawer"/);
    assert.match(sa, /crm-workspace\.js/);
    assert.match(workspace, /\/api\/superadmin\/crm\/people/);
    assert.doesNotMatch(workspace, /Twenty|twenty/);
    assert.doesNotMatch(admin, /\/api\/admin\/crm|id="page-crm"|data-page="crm"|crm-workspace/);
  });
});
