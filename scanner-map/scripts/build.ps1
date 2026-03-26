cd scanner-map/frontend
npm.cmd install
npm.cmd run build
cd ../..
pyinstaller --onefile --noconsole --add-data "scanner-map/frontend/dist;frontend/dist" scanner-map/desktop/launcher.py -n scanner-map
