import { Database } from './db'

export class AuthorFeedFetcher {
  private user: string; // the user who follows all authors
  private intervalId: NodeJS.Timeout | null; // To store the interval ID
  private fetchInterval: number; // Interval time in milliseconds
  private limit: number;
  private db: Database;

  constructor(user: string, db: Database, fetchInterval: number = 60000, limit: number = 20) {
    this.user = user;
    this.fetchInterval = fetchInterval; // Default to 1 minute
    this.intervalId = null; // Initially not set
    this.limit = limit;
    this.db = db;
  }

  private async getAuthors(): Promise<string[]> {
    const endpoint = `https://public.api.bsky.app/xrpc/app.bsky.graph.getFollows?actor=${this.user}&limit=100`;
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: unknown = await response.json();
      const follows: {}[] = (data as {follows: {did: string}[]}).follows;
      const result: string[] = [];
      follows.forEach(function(entry:{did: string}) {
        result.push(entry.did);
      });
      return result;
    } finally {
    }
  }

  // Method to fetch a single author's feed
  private async getAuthorFeed(user: string): Promise<void> {
    const cursor = await this.getCursorByAuthor(user);
    const previous = cursor ? new Date(cursor).getTime() : 0;
    const limit = cursor ? this.limit : 100;
    const endpoint = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${user}&limit=${limit}`;
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: unknown = await response.json();
      const feed: {}[] = (data as {feed: {}[]}).feed;
      if (!feed || !feed.length) {
        return;
      }
      const posts: {uri: string, cid: string, indexedAt: string, user: string}[] = [];
      let latest:number = 0;
      feed.forEach(function(entry: {post: {uri: string, cid: string, record: {createdAt: string}}, reason: {$type: string, indexedAt: string}}){
        const post = entry.post;
        const uri = post?.uri;
        const cid = post?.cid;
        const createdAt = post?.record?.createdAt;
        const reason = entry.reason;
        const reasonType = reason?.$type;
        const respostedAt = reason?.indexedAt;
        const newCursor = reasonType === "app.bsky.feed.defs#reasonRepost" ? respostedAt : createdAt;
        if (uri && cid && newCursor) {
          const ts = new Date(newCursor).getTime();
          if (ts > previous) {
            latest = latest < ts ? ts : latest;
            posts.push({uri: uri, cid: cid, indexedAt: cursor ? new Date().toISOString() : new Date(newCursor).toISOString(), user: user});
          }
        }
      });
      if (posts && posts.length) {
        await this.updateCursor({author: user, cursor: new Date(latest).toISOString()});
        await this.storePosts(posts);
      }
    } catch (error) {
      console.error(`Error fetching feed for user ${user}:`, error);
    }
  }

  // Method to fetch all feeds
  private async fetchAllFeeds(): Promise<void> {
    console.log("Fetching feeds...");
    const users = await this.getAuthors();
    for (const user of users) {
      try {
        await this.getAuthorFeed(user);
      } catch (error) {
        console.error(`Failed to fetch feed for user ${user}:`, error);
      }
    }
  }

  // Method to start the timer
  public start(): void {
    if (this.intervalId) {
      console.log("Fetcher is already running.");
      return;
    }

    // Fetch immediately and then set the interval
    this.fetchAllFeeds(); // Run immediately
    this.intervalId = setInterval(() => this.fetchAllFeeds(), this.fetchInterval);
    console.log("Fetcher started.");
  }

  // Method to stop the timer
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Fetcher stopped.");
    } else {
      console.log("Fetcher is not running.");
    }
  }

  async updateCursor(item: {author: string, cursor: string}) {
    await this.db
      .replaceInto('author')
      .values(item)
      .execute();
  }

  async storePosts(posts : ({cid: string, indexedAt: string, uri: string, user: string})[]) {
    await this.db
      .insertInto('post')
      .values(posts)
      .onConflict((oc) => oc.doNothing())
      .execute()
  }

  async getCursorByAuthor(author: string): Promise<string | null> {
    const result = await this.db
      .selectFrom('author') // Specify the table
      .select('cursor') // Select the 'cursor' column
      .where('author', '=', author) // Filter by 'author'
      .executeTakeFirst(); // Get the first (or only) result

    return result?.cursor || null; // Return the cursor or null if not found
  }
}
