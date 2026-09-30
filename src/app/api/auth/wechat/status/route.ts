import { NextResponse } from 'next/server'

function unavailableResponse() {
  return NextResponse.json(
    {
      success: false,
      error: '微信登录尚未接入，待第三方配置',
      code: 'WECHAT_IDENTITY_UNAVAILABLE',
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function GET() {
  return unavailableResponse()
}

export async function POST() {
  return unavailableResponse()
}
