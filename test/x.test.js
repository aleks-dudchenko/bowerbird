import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bestVariant,
  orderedVariants,
  isXUrl,
  mediaFromSyndication,
  pickFromMedia,
  syndicationToken,
  syndicationUrl,
  tweetIdFrom,
  upgradeMediaUrl,
} from '../src/shared/x.js'

const ORIG = 'https://pbs.twimg.com/media/GxK9?format=jpg&name=orig'

test('every spelling of a downscaled image upgrades to the same original', () => {
  for (const input of [
    'https://pbs.twimg.com/media/GxK9?format=jpg&name=small',
    'https://pbs.twimg.com/media/GxK9?format=jpg&name=900x900',
    'https://pbs.twimg.com/media/GxK9.jpg:large',
    'https://pbs.twimg.com/media/GxK9.jpg',
    'https://pbs.twimg.com/media/GxK9.jpeg',
  ]) {
    assert.equal(upgradeMediaUrl(input), ORIG, input)
  }
})

test('an explicit format is kept rather than guessed from the extension', () => {
  assert.equal(
    upgradeMediaUrl('https://pbs.twimg.com/media/GxK9.jpg?format=png&name=small'),
    'https://pbs.twimg.com/media/GxK9?format=png&name=orig'
  )
})

test('video thumbnails live on the same host and upgrade the same way', () => {
  assert.equal(
    upgradeMediaUrl('https://pbs.twimg.com/ext_tw_video_thumb/17/pu/img/ab.jpg'),
    'https://pbs.twimg.com/ext_tw_video_thumb/17/pu/img/ab?format=jpg&name=orig'
  )
})

test('anything not on pbs.twimg.com is left exactly as it was', () => {
  for (const url of [
    'https://example.com/a.png?name=small',
    'https://video.twimg.com/ext_tw_video/1/pu/vid/720x1280/x.mp4?tag=14',
    'not a url at all',
    '',
  ]) {
    assert.equal(upgradeMediaUrl(url), url)
  }
})

test('the best variant is the highest-bitrate mp4, never the playlist', () => {
  const variants = [
    { bitrate: 632000, content_type: 'video/mp4', url: 'low.mp4' },
    { content_type: 'application/x-mpegURL', url: 'playlist.m3u8' },
    { bitrate: 2176000, content_type: 'video/mp4', url: 'high.mp4' },
    { bitrate: 950000, content_type: 'video/mp4', url: 'mid.mp4' },
  ]
  assert.equal(bestVariant(variants), 'high.mp4')
})

test('a GIF has one mp4 and no bitrate at all, and still resolves', () => {
  assert.equal(bestVariant([{ content_type: 'video/mp4', url: 'gif.mp4' }]), 'gif.mp4')
})

test('an HLS-only video resolves to nothing rather than to a playlist', () => {
  assert.equal(bestVariant([{ content_type: 'application/x-mpegURL', url: 'p.m3u8' }]), null)
  assert.equal(bestVariant([]), null)
  assert.equal(bestVariant(null), null)
})

test('a tweet id is found in a permalink and in a photo deep-link', () => {
  assert.equal(tweetIdFrom('https://x.com/jane/status/1899123456789'), '1899123456789')
  assert.equal(tweetIdFrom('/jane/status/1899123456789/photo/2'), '1899123456789')
  assert.equal(tweetIdFrom('https://x.com/jane'), null)
  assert.equal(tweetIdFrom(null), null)
})

test('the syndication token is the digits-and-dots-stripped base 36 form', () => {
  const id = '1234567890123456789'
  const expected = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
  assert.equal(syndicationToken(id), expected)
  assert.match(syndicationUrl(id), /^https:\/\/cdn\.syndication\.twimg\.com\/tweet-result\?id=/)
  assert.ok(!syndicationToken(id).includes('.'))
})

test('X hosts are recognised under both names, and nothing else is', () => {
  assert.ok(isXUrl('https://x.com/jane/status/1'))
  assert.ok(isXUrl('https://twitter.com/jane'))
  assert.ok(!isXUrl('https://xx.com/jane'))
  assert.ok(!isXUrl('https://notx.com/'))
})

test('a video tweet resolves to the video even when it also has a poster', () => {
  const media = mediaFromSyndication({
    mediaDetails: [
      {
        type: 'video',
        media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/p.jpg',
        video_info: {
          variants: [
            { bitrate: 1, content_type: 'video/mp4', url: 'low.mp4' },
            { bitrate: 9, content_type: 'video/mp4', url: 'best.mp4' },
          ],
        },
      },
    ],
  })
  assert.equal(media.length, 1)
  assert.equal(pickFromMedia(media), 'best.mp4')
})

test('a photo tweet resolves to the original, not to what was rendered', () => {
  const media = mediaFromSyndication({
    mediaDetails: [
      { type: 'photo', media_url_https: 'https://pbs.twimg.com/media/GxK9.jpg' },
    ],
  })
  assert.equal(pickFromMedia(media), ORIG)
})

test('top-level video variants are read when mediaDetails has none', () => {
  const media = mediaFromSyndication({
    video: { variants: [{ content_type: 'video/mp4', url: 'only.mp4' }] },
  })
  assert.equal(pickFromMedia(media), 'only.mp4')
})

test('an empty or unexpected payload picks nothing instead of throwing', () => {
  assert.equal(pickFromMedia(mediaFromSyndication({})), null)
  assert.equal(pickFromMedia(mediaFromSyndication(null)), null)
  assert.equal(pickFromMedia([]), null)
})

test('the embed player spells the same variant list differently', () => {
  const variants = [
    { type: 'application/x-mpegURL', src: 'p.m3u8' },
    { type: 'video/mp4', src: 'only.mp4' },
  ]
  assert.equal(bestVariant(variants), 'only.mp4')
})

test('a post that quotes a video post resolves to the quoted video', () => {
  const media = mediaFromSyndication({
    entities: {},
    quoted_tweet: {
      mediaDetails: [
        {
          type: 'video',
          media_url_https: 'https://pbs.twimg.com/amplify_video_thumb/1/img/p.jpg',
          video_info: {
            variants: [
              { content_type: 'application/x-mpegURL', url: 'p.m3u8' },
              { bitrate: 832000, content_type: 'video/mp4', url: 'mid.mp4' },
              { bitrate: 10368000, content_type: 'video/mp4', url: 'best.mp4' },
            ],
          },
        },
      ],
    },
  })
  assert.equal(pickFromMedia(media), 'best.mp4')
})

test('a post with its own media never reaches into the quoted one', () => {
  const media = mediaFromSyndication({
    mediaDetails: [{ type: 'photo', media_url_https: 'https://pbs.twimg.com/media/Own.jpg' }],
    quoted_tweet: {
      mediaDetails: [{ type: 'photo', media_url_https: 'https://pbs.twimg.com/media/Quoted.jpg' }],
    },
  })
  assert.equal(pickFromMedia(media), 'https://pbs.twimg.com/media/Own?format=jpg&name=orig')
})

test('every mp4 variant survives, ordered so a failure only costs resolution', () => {
  const variants = [
    { bitrate: 632000, content_type: 'video/mp4', url: 'low.mp4' },
    { content_type: 'application/x-mpegURL', url: 'playlist.m3u8' },
    { bitrate: 2176000, content_type: 'video/mp4', url: 'high.mp4' },
  ]
  assert.deepEqual(orderedVariants(variants), ['high.mp4', 'low.mp4'])
  assert.deepEqual(orderedVariants([]), [])
})
