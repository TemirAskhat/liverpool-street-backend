import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;
    const filename = formData.get('filename') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    if (!filename) {
      return NextResponse.json(
        { error: 'No filename provided' },
        { status: 400 }
      );
    }

    // Convert the File to a Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Define the path to save the image
    const publicDir = path.join(process.cwd(), 'public', 'captured-images');
    const filePath = path.join(publicDir, filename);

    // Ensure the directory exists
    await fs.mkdir(publicDir, { recursive: true });

    // Write the file to disk
    await fs.writeFile(filePath, buffer);

    console.log(`Image saved to: ${filePath}`);

    return NextResponse.json({
      success: true,
      message: 'Image saved successfully',
      filename,
      path: `/captured-images/${filename}`,
      size: buffer.length,
    });
  } catch (error) {
    console.error('Error saving image:', error);
    return NextResponse.json(
      { error: 'Failed to save image' },
      { status: 500 }
    );
  }
}