import test from 'node:test';
import assert from 'node:assert/strict';
import { CRITERIA, scoreAppreciation } from '../appreciation-score.mjs';

test('weights total 100 and safety is outside the weighted score', () => {
  assert.equal(CRITERIA.length, 13);
  assert.equal(CRITERIA.reduce((sum, item) => sum + item.weight, 0), 100);
  assert.equal(CRITERIA[0].weight, 0);
});

test('unverified safety or too little evidence never receives a single score', () => {
  assert.equal(scoreAppreciation({ 2: 'yes' }).score, null);
  assert.deepEqual(scoreAppreciation({ 2: 'yes' }).range, [18, 100]);
  assert.equal(scoreAppreciation({ 1: 'yes', 2: 'yes' }).score, null);
});

test('safety failure vetoes even a perfect weighted checklist', () => {
  const answers = Object.fromEntries(CRITERIA.map((item) => [item.rank, 'yes']));
  answers[1] = 'no';
  const result = scoreAppreciation(answers);
  assert.equal(result.earned, 100);
  assert.equal(result.score, null);
  assert.equal(result.veto, 'no');
});

test('sufficient reviewed weight produces score and unknown range', () => {
  const answers = { 1: 'yes', 2: 'yes', 3: 'yes', 4: 'yes', 5: 'no', 6: 'yes', 7: 'yes', 8: 'yes' };
  const result = scoreAppreciation(answers);
  assert.equal(result.assessed, 72);
  assert.equal(result.score, 63);
  assert.deepEqual(result.range, [63, 91]);
});
