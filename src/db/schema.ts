export type DatabaseSchema = {
  post: Post
  sub_state: SubState
  author: Author
}

export type Post = {
  uri: string
  cid: string
  indexedAt: string
  user: string
}

export type Author = {
  author: string
  cursor: string
}

export type SubState = {
  service: string
  cursor: number
}
