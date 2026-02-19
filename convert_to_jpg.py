#!/usr/bin/env python3
# Copyright 2026 John Garnett
import os
import sys
import base64
from io import BytesIO
from PIL import Image

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), 'uploads')
PREFIX = 'data:image/png;base64,'

def convert_file(filepath):
   """Read a base64 data URI file, decode it, and save as JPG."""
   with open(filepath, 'r') as f:
      data = f.read().strip()

   if data.startswith(PREFIX):
      b64_data = data[len(PREFIX):]
   elif data.startswith('data:image/'):
      # Handle other possible prefixes
      comma_idx = data.index(',')
      b64_data = data[comma_idx + 1:]
   else:
      b64_data = data

   img_bytes = base64.b64decode(b64_data)
   img = Image.open(BytesIO(img_bytes))

   # Convert to RGB if necessary (PNG may have alpha channel)
   if img.mode in ('RGBA', 'P', 'LA'):
      img = img.convert('RGB')

   jpg_path = filepath + '.jpg'
   img.save(jpg_path, 'JPEG', quality=90)
   return jpg_path

def main():
   files = [f for f in os.listdir(UPLOADS_DIR) if not f.endswith('.jpg')]
   total = len(files)
   success = 0
   errors = []

   for i, filename in enumerate(files, 1):
      filepath = os.path.join(UPLOADS_DIR, filename)
      if not os.path.isfile(filepath):
         continue
      try:
         convert_file(filepath)
         success += 1
         if i % 50 == 0 or i == total:
            print(f"Progress: {i}/{total} processed, {success} converted")
      except Exception as e:
         errors.append((filename, str(e)))
         if i % 50 == 0 or i == total:
            print(f"Progress: {i}/{total} processed, {success} converted")

   print(f"\nDone: {success}/{total} converted successfully")
   if errors:
      print(f"{len(errors)} errors:")
      for name, err in errors[:10]:
         print(f"  {name}: {err}")
      if len(errors) > 10:
         print(f"  ... and {len(errors) - 10} more")

if __name__ == '__main__':
   main()
