const { expect } = require('@playwright/test');

/**
 * Helpers for the read-aloud interviews (InterviewFlow + InterviewQuestion).
 *
 * Questions with five or fewer answers render as a radio group whose native inputs are visually
 * hidden inside a styled label, so the label is what a person clicks, and what these click.
 */

/** Pick an answer. `scope` narrows it when the same answer text appears in several questions. */
async function chooseAnswer(scope, answer) {
  const page = 'page' in scope ? scope.page() : scope;
  const radio = scope.getByRole('radio', { name: answer, exact: true });
  await scope
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: answer, exact: true }) })
    .click();
  await expect(radio).toBeChecked();
}

/** The radio group for one question, by its short label. */
function question(scope, label) {
  return scope.getByRole('radiogroup', { name: label, exact: true });
}

/**
 * Answer a single-choice question by its short label, whichever way it renders: a radio group for
 * five or fewer answers, a select for longer lists.
 */
async function answer(scope, label, option) {
  const group = question(scope, label);
  /*
    Wait for the question by role. count() alone races a section still rendering, and a select
    popover that is still closing hides the rest of the page from the accessibility tree.
  */
  await expect(
    group.or(scope.getByRole('combobox', { name: label, exact: true })).first(),
  ).toBeVisible();
  if (await group.count()) {
    await chooseAnswer(group, option);
    return;
  }
  const page = 'page' in scope ? scope.page() : scope;
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Open an interview section from the rail. `interview` is the rail's name, e.g. "Hypertension interview". */
async function openSection(page, interview, section) {
  await page
    .getByRole('navigation', { name: interview })
    .getByRole('button', { name: section })
    .click();
}

module.exports = { answer, chooseAnswer, question, openSection };
