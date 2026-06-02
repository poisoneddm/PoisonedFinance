import { defineFeature, loadFeature } from 'jest-cucumber';
import path from 'path';
// Cross-workspace import: pillStatus is a pure function with no Node.js deps.
// babel-jest resolves the relative path at runtime without TypeScript config.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pillStatus } = require('../../../../api/src/lib/pillStatus') as typeof import('../../../../api/src/lib/pillStatus');

const feature = loadFeature(
  path.join(__dirname, '../../../../features/budgeting/dashboard-pills.feature'),
);

defineFeature(feature, test => {

  test('Needs pill status by spend ratio', ({ given, when, then }) => {
    let goalPence: number;
    let spentPence: number;

    given(/^the monthly needs goal is (\d+) pence$/, (goalStr: string) => {
      goalPence = parseInt(goalStr, 10);
    });

    when(/^needs spending is (\d+) pence$/, (spentStr: string) => {
      spentPence = parseInt(spentStr, 10);
    });

    then(/^the needs pill status is "(.*)"$/, (status: string) => {
      expect(pillStatus(spentPence, goalPence, 'needs')).toBe(status);
    });
  });

  test('Wants pill status by spend ratio', ({ given, when, then }) => {
    let goalPence: number;
    let spentPence: number;

    given(/^the monthly wants goal is (\d+) pence$/, (goalStr: string) => {
      goalPence = parseInt(goalStr, 10);
    });

    when(/^wants spending is (\d+) pence$/, (spentStr: string) => {
      spentPence = parseInt(spentStr, 10);
    });

    then(/^the wants pill status is "(.*)"$/, (status: string) => {
      expect(pillStatus(spentPence, goalPence, 'wants')).toBe(status);
    });
  });

  test('Savings pill status is reversed — higher is better', ({ given, when, then }) => {
    let goalPence: number;
    let savedPence: number;

    given(/^the monthly savings goal is (\d+) pence$/, (goalStr: string) => {
      goalPence = parseInt(goalStr, 10);
    });

    when(/^savings amount is (\d+) pence$/, (savedStr: string) => {
      savedPence = parseInt(savedStr, 10);
    });

    then(/^the savings pill status is "(.*)"$/, (status: string) => {
      expect(pillStatus(savedPence, goalPence, 'savings')).toBe(status);
    });
  });

  test('Needs pill is red when goal is zero and there is any spending', ({ given, when, then }) => {
    let goalPence: number;
    let spentPence: number;

    given(/^the monthly needs goal is (\d+) pence$/, (goalStr: string) => {
      goalPence = parseInt(goalStr, 10);
    });

    when(/^needs spending is (\d+) pence$/, (spentStr: string) => {
      spentPence = parseInt(spentStr, 10);
    });

    then(/^the needs pill status is "(.*)"$/, (status: string) => {
      expect(pillStatus(spentPence, goalPence, 'needs')).toBe(status);
    });
  });

  test('Savings pill is green when goal is zero and savings is zero', ({ given, when, then }) => {
    let goalPence: number;
    let savedPence: number;

    given(/^the monthly savings goal is (\d+) pence$/, (goalStr: string) => {
      goalPence = parseInt(goalStr, 10);
    });

    when(/^savings amount is (\d+) pence$/, (savedStr: string) => {
      savedPence = parseInt(savedStr, 10);
    });

    then(/^the savings pill status is "(.*)"$/, (status: string) => {
      expect(pillStatus(savedPence, goalPence, 'savings')).toBe(status);
    });
  });
});
