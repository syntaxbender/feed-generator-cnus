import http from 'http'
import events from 'events'
import express from 'express'
import { DidResolver, MemoryCache } from '@atproto/identity'
import { createServer } from './lexicon'
import feedGeneration from './methods/feed-generation'
import describeGenerator from './methods/describe-generator'
import { createDb, Database, migrateToLatest } from './db'
import { AppContext, Config } from './config'
import wellKnown from './well-known'
import { AuthorFeedFetcher } from './authorfeed'

export class FeedGenerator {
  public app: express.Application
  public server?: http.Server
  public db: Database
  public authorFeedFetcher: AuthorFeedFetcher
  public cfg: Config

  private static communityAuthors : string[] =[
    'did:plc:wdjhbjglrkyr5qfct7pkcslx',
    'did:plc:n4u6dyepykflz4soyefg5ulc',
    'did:plc:pcjsxxxxyzxsfqvqtd2xk324',
    'did:plc:jz66fc77sij4xsogmn5v2epc',
    'did:plc:kngrockcarangfubarqoyvdc',
    'did:plc:lnzmajbr3ypizoraybki3wu5',
    'did:plc:ijlbo4c5dfwummdgjpv3xbxq',
    'did:plc:nmbuaylewf6faxu524bpnfmp',
    'did:plc:onyfk52wfjagg6b5obypzsqu',
    'did:plc:muixueha34qahryodb3tjblf',
    'did:plc:v7on6gee4ulcla27p7nuhiyv',
    'did:plc:sm4uhptbj2wv3oje7hn3o7de'
  ];

  // this user follows all the authors we use to generate the feed.
  private static feedCreator : string = 'did:plc:mz55jom266qo3klyvq3brfs6';

  constructor(
    app: express.Application,
    db: Database,
    authorFeedFetcher: AuthorFeedFetcher,
    cfg: Config,
  ) {
    this.app = app
    this.db = db
    this.authorFeedFetcher = authorFeedFetcher
    this.cfg = cfg
  }

  static create(cfg: Config) {
    const app = express()
    const db = createDb(cfg.sqliteLocation)
    const authorFeedFetcher = new AuthorFeedFetcher(FeedGenerator.feedCreator, db)

    const didCache = new MemoryCache()
    const didResolver = new DidResolver({
      plcUrl: 'https://plc.directory',
      didCache,
    })

    const server = createServer({
      validateResponse: true,
      payload: {
        jsonLimit: 100 * 1024, // 100kb
        textLimit: 100 * 1024, // 100kb
        blobLimit: 5 * 1024 * 1024, // 5mb
      },
    })
    const ctx: AppContext = {
      db,
      didResolver,
      cfg,
    }
    feedGeneration(server, ctx)
    describeGenerator(server, ctx)
    app.use(server.xrpc.router)
    app.use(wellKnown(ctx))

    return new FeedGenerator(app, db, authorFeedFetcher, cfg)
  }

  async start(): Promise<http.Server> {
    await migrateToLatest(this.db)
    this.authorFeedFetcher.start()
    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost)
    await events.once(this.server, 'listening')
    return this.server
  }
}

export default FeedGenerator
