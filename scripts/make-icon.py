"""Render the app's geometric mark for the Windows taskbar and tray."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
size = 512
image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((5, 5, 507, 507), radius=155, fill='#426b50')
points = [(139, 277), (213, 352), (373, 160)]
draw.line(points, fill='#fffef6', width=42, joint='curve')
for x, y in points:
    draw.ellipse((x-21, y-21, x+21, y+21), fill='#fffef6')
draw.ellipse((330, 320, 394, 384), fill='#b8d5a2')
image.save(root / 'assets/icon.png')
image.save(root / 'assets/icon.ico', sizes=[(16,16), (24,24), (32,32), (48,48), (64,64), (128,128), (256,256)])
