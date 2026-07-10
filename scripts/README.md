# Backup & Restore Scripts

Lihtsad skriptid Qortium United Community projekti varundamiseks ja taastamiseks.

## Asukoht

Varundused salvestatakse:
```
/home/iffiolen/VS-Code-Projects/_workspace_backups/QORTIUM/
```

Faili nime formaat: `qortium-united-community_AAAA-KK-PP_TT-MM-SS.tar.gz`

Säilitatakse **2 viimast** backupi, vanemad kustutatakse automaatselt.

---

## Kasutamine

### Backup (varunda)

```bash
npm run backup
```

Loob ajatempliga `.tar.gz` backupi (ilma `node_modules`, `dist`, `.git` kaustadeta) ja hoiab alles ainult 2 uusimat.

### Restore (taasta)

```bash
npm run restore
```

Kuvab olemasolevate backupide nimekirja koos suurusega. Sisesta number, et valida taastatav versioon. Skript küsib ka kinnitust enne ülekirjutamist.

---

## Nõuded

- Bash shell (Linux/MacOS/WSL)
- `tar` ja `find` käsud (tavaliselt olemas)
