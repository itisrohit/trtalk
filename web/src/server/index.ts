import { createApp } from './app'
import { loadConfig } from './config'
import { loadDotenv } from './env'

loadDotenv()
const cfg = loadConfig()
createApp({ config: cfg }).listen(cfg.port, () => {
  // eslint-disable-next-line no-console
  console.log(`trtalk-web gateway listening on :${cfg.port} → core ${cfg.coreUrl}`)
})
