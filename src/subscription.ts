import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType, CreateOp } from './util/subscription'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  getPosts(creates: CreateOp<Record<any, any>>[]) {
    const communityAuthors : {} = {
      'did:plc:wdjhbjglrkyr5qfct7pkcslx': true,
      'did:plc:n4u6dyepykflz4soyefg5ulc': true,
      'did:plc:pcjsxxxxyzxsfqvqtd2xk324': true,
      'did:plc:jz66fc77sij4xsogmn5v2epc': true,
      'did:plc:kngrockcarangfubarqoyvdc': true,
      'did:plc:lnzmajbr3ypizoraybki3wu5': true,
      'did:plc:ijlbo4c5dfwummdgjpv3xbxq': true,
      'did:plc:nmbuaylewf6faxu524bpnfmp': true,
      'did:plc:onyfk52wfjagg6b5obypzsqu': true,
      'did:plc:muixueha34qahryodb3tjblf': true,
      'did:plc:v7on6gee4ulcla27p7nuhiyv': true,
      'did:plc:sm4uhptbj2wv3oje7hn3o7de': true,
    };
    return creates.filter((create) => {
      if (create.author && communityAuthors[create.author]) {
        if (create.record.text) {
          return !create.record.text.toLowerCase().includes('#np')
        }
        return true
      }
      return false
    })
    .map((create) => {
      return {
        uri: create.uri,
        cid: create.cid,
        indexedAt: new Date().toISOString(),
      }
    })
  }

  async storePosts(posts : ({cid: string, indexedAt: string, uri: string})[]) {
    await this.db
      .insertInto('post')
      .values(posts)
      .onConflict((oc) => oc.doNothing())
      .execute()
  }

  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return

    const ops = await getOpsByType(evt)

    const postsToCreate = this.getPosts(ops.posts.creates)

    if (postsToCreate.length > 0) {
      await this.storePosts(postsToCreate)
    }

    const repostsToCreate = this.getPosts(ops.reposts.creates)

    if (repostsToCreate.length > 0) {
      await this.storePosts(repostsToCreate)
    }
  }
}
