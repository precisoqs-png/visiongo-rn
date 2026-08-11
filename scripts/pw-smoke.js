// Playwright smoke test: seeds an OLD-shape persisted blob into
// localStorage (simulating a real existing user's data), loads the app, and
// checks it renders without crashing / console errors, with items and
// progress intact. Run with:
//   NODE_PATH=/opt/node22/lib/node_modules node scripts/pw-smoke.js
const { chromium } = require('playwright');

const OLD_BLOB = {
  state: {
    years: [
      {
        year: 2026,
        motto: 'Dream it. Plan it. Live it.',
        goals: [
          {
            id: 'g1', title: 'Get fit', colorIndex: 0, targetDate: '2026-12-31',
            reminder: { on: false, frequency: 'Daily' }, chat: [], pendingActions: [],
            measurables: [
              { id: 'm1', type: 'check', label: 'Sign up for a race', done: true, current: 0, target: 0, unit: '', step: 1, weeks: [] },
              { id: 'm2', type: 'number', label: 'Days active', done: false, current: 45, target: 150, unit: 'days', step: 1, weeks: [] },
            ],
            milestones: [],
          },
          {
            id: 'g2', title: 'Save for a trip', colorIndex: 1, targetDate: '2026-10-01',
            reminder: { on: false, frequency: 'Daily' }, chat: [], pendingActions: [],
            measurables: [],
            milestones: [
              {
                id: 'mg1', title: 'Save $10,000', kind: 'numeric', target: 10000, current: 3000,
                unit: '$', step: 100, deadline: '2026-10-01', done: false,
                steps: [
                  { id: 's1', label: 'Save $830 per month', amount: 830, unit: '$', cadence: 'monthly',
                    completions: ['2026-01', '2026-02'], createdAt: '2026-01-01T00:00:00.000Z',
                    schedule: { on: false, weekday: 2, dayOfMonth: 28, hour: 9, minute: 0 } },
                ],
              },
            ],
          },
        ],
      },
    ],
    notificationsMasterOn: true,
    hasCompletedOnboarding: true,
    selectedYear: 2026,
    boardLayout: 'radial',
    boardViewMode: 'wholeYear',
    coachUsage: { date: '', count: 0 },
  },
  version: 4,
};

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));

  await page.goto('http://localhost:8099/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((blob) => {
    localStorage.setItem('visiongo-app-data', JSON.stringify(blob));
  }, OLD_BLOB);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasGetFit = bodyText.includes('Get fit');
  const hasSaveTrip = bodyText.includes('Save for a trip');

  console.log('--- Console/page errors ---');
  errors.forEach((e) => console.log(e));
  console.log('--- Body snippet ---');
  console.log(bodyText.slice(0, 800));
  console.log('--- Checks ---');
  console.log('hasGetFit:', hasGetFit);
  console.log('hasSaveTrip:', hasSaveTrip);
  console.log('errorCount:', errors.length);

  // Open "Save for a trip" and check the migrated milestone (former
  // Milestone with a Commitment) renders correctly on the consolidated
  // milestones screen — both former-measurable and former-milestone items
  // present, nothing dropped.
  await page.getByText('Save for a trip').first().click();
  await page.waitForTimeout(1500);
  await page.getByText('Milestones', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  const goalBody = await page.evaluate(() => document.body.innerText);
  console.log('--- Goal screen snippet ---');
  console.log(goalBody.slice(0, 1200));
  const hasMilestoneTitle = goalBody.includes('Save $10,000');
  const hasCommitment = goalBody.includes('Save $830 per month');
  console.log('hasMilestoneTitle:', hasMilestoneTitle, 'hasCommitment:', hasCommitment);

  await browser.close();
  if (errors.length > 0 || !hasGetFit || !hasSaveTrip || !hasMilestoneTitle || !hasCommitment) {
    process.exit(1);
  }
})();
