# 30. Setting up clinic devices

For whoever looks after clinic IT. Nkwapa keeps patient data on a device only for offline work,
encrypted, and opened only after the person unlocks it. These settings protect the rest: the disk
the browser writes to, and the moment after someone unlocks.

Check each setting on each device; the "Check" column says how. Models differ, so do not assume.

## Every device

- A screen lock (PIN, password, or fingerprint with a PIN behind it), locking after a few minutes.
- The operating system and the browser kept up to date.
- Nkwapa in Chrome or Edge, installed as an app or opened in the browser.
- Report a lost or stolen device the same day: `29_LOST_OR_STOLEN_DEVICE.md`.

## Windows laptops

| Setting                           | How                                                                                                                                                                   | Check                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Disk encryption                   | Windows Pro or higher: BitLocker on the system drive. Windows Home: Settings, Privacy and security, Device encryption (only on hardware that supports it)             | `manage-bde -status C:` in an administrator terminal shows "Protection On". Home: the Device encryption page says it is on |
| No developer tools in the browser | Chrome: registry `HKLM\SOFTWARE\Policies\Google\Chrome`, DWORD `DeveloperToolsAvailability` = `2`. Edge: the same value under `HKLM\SOFTWARE\Policies\Microsoft\Edge` | `chrome://policy` (or `edge://policy`) lists `DeveloperToolsAvailability` = 2, and F12 opens nothing                       |
| One account per person            | A separate Windows account for each person who uses the laptop, or at least a separate browser profile each                                                           | Each person signs in to their own account or profile                                                                       |

## MacBooks

| Setting                           | How                                                                                                                                                                          | Check                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Disk encryption                   | System Settings, Privacy and Security, FileVault: on                                                                                                                         | The FileVault pane says it is on                                                    |
| No developer tools in the browser | A configuration profile that sets `DeveloperToolsAvailability` = `2` for Chrome (`com.google.Chrome`) or Edge (`com.microsoft.Edge`) [VERIFY: on one Mac before rolling out] | `chrome://policy` (or `edge://policy`) lists it, and Option-Command-I opens nothing |
| One account per person            | A separate macOS user, or a separate browser profile each                                                                                                                    | Each person signs in to their own                                                   |

## Android phones and tablets (clinic-owned)

| Setting               | How                                                                                                            | Check                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Disk encryption       | On by default on devices that shipped with Android 10 or later, once a screen lock is set                      | Settings, Security (the name varies by maker) shows the device as encrypted [VERIFY: on each model] |
| No developer tools    | Android's Chrome has no developer tools of its own; debugging needs USB debugging. Leave Developer options off | Settings has no "Developer options" entry, or USB debugging is off                                  |
| One person per device | Android tablets can have a user per person; otherwise one person per device                                    | Each person unlocks Nkwapa only as themselves                                                       |

## Personal phones

Nkwapa cannot enforce anything on a phone the clinic does not own. Ask staff who use their own
phone to:

- keep a screen lock and an up-to-date system;
- not lend the phone while Nkwapa is unlocked;
- report a lost phone the same day, like a clinic device.

Offline access is optional. A clinic can ask staff to turn it on only on clinic devices.

## Why developer tools are switched off

While someone has Nkwapa unlocked, the keys that open the device's offline copy are in the
browser's memory. Developer tools can read that memory and the browser's storage. On a shared
clinic laptop, switching them off means the next person at the keyboard cannot use them to read
the last person's data.
