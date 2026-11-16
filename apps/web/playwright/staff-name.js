/**
 * Fill the shared staff name fields (#225), on the name step, the invite form or the admin
 * dialog. `scope` is the page or the dialog holding them; fields left out are cleared.
 */
async function fillStaffName(scope, { firstName = '', middleName = '', lastName = '' }) {
  await scope.getByLabel('First name').fill(firstName);
  await scope.getByLabel('Middle name(s)').fill(middleName);
  await scope.getByLabel('Last name').fill(lastName);
}

module.exports = { fillStaffName };
