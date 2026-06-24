import { ImageResponse } from 'next/og';

export const size = {
  width: 128,
  height: 128,
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 64,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#3B82F6',
          color: 'white',
          fontWeight: 'bold',
          borderRadius: '24px',
        }}
      >
        KP
      </div>
    ),
    {
      ...size,
    }
  );
}
