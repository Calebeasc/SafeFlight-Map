cd scanner-map/frontend
npm install
npm run build
cd ../..
pyinstaller --onefile --noconsole --add-data "scanner-map/frontend/dist;frontend/dist" scanner-map/desktop/app.py -n scanner-map
