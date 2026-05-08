# Minecraft Server Ops

Discord-based Minecraft server operations automation for GCE.

This project extends GCE VM power control with Minecraft-safe shutdown, backup automation, idle auto stop, and Discord-native server operations.

---

## Core Features

### GCE VM Control

* Start VM from Discord
* Stop VM from Discord
* Check VM status
* Slash command based operations

### Minecraft Safe Shutdown

* RCON player count check
* save-all before shutdown
* world backup
* Minecraft stop confirmation
* VM shutdown only after safe stop

### Idle Auto Stop

* Detect no online players
* Wait configurable idle timeout
* Automatic save + backup + shutdown

### Backup Policy

* Backup before VM stop
* Cloud Storage upload
* Keep latest 7 backups

### Discord-native Operations

* `/start`
* `/stop`
* `/status`
* `/backup`
* `/players`
* operational alerts
* auto shutdown notifications

---

## Safe Shutdown Flow

Discord `/stop`

→ Check player count
→ save-all
→ backup
→ stop Minecraft
→ confirm stopped
→ stop GCE VM

VM must never stop before Minecraft shutdown.

---

## Environment

Set your environment variables in `.env`.

Required GCP permissions:

* compute.instances.start
* compute.instances.stop
* compute.instances.get
* compute.zoneOperations.get

If running on GCP with an attached Service Account,
`GOOGLE_APPLICATION_CREDENTIALS` may be omitted.

---

## VM Scripts

Minecraft VM-local scripts live under `scripts/vm/` in this repo and are intended to be deployed to `/opt/mcops/scripts/` on the VM.

Create `/opt/mcops/mcops.env` from `scripts/vm/mcops.env.example`. The Bot executes fixed script paths over SSH, including `/opt/mcops/scripts/backup.sh`.

For same-VM validation, set `REMOTE_COMMAND_MODE=local` so the Bot runs `/opt/mcops/scripts/backup.sh` directly. Use `REMOTE_COMMAND_MODE=ssh` when the Bot runs outside the Minecraft VM.

---

## Attribution

This project is based on `discord-gce-vm-power` by pione30.

The original repository states MIT in its README.

Original repository:
https://github.com/pione30/discord-gce-vm-power

This project extends the original concept for Minecraft server operations automation, including safe shutdown, backup automation, idle auto stop, and Discord-native operations.

---

## License

This project follows the original repository attribution.

Please refer to the original project for upstream licensing details.
