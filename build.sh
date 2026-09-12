#!/bin/bash
set -e

echo "===== Step 1: Build Frontend ====="
cd "$(dirname "$0")"
npm run build

echo "===== Step 2: Add WEB-INF/web.xml for Tomcat routing ====="
mkdir -p dist/WEB-INF
cat > dist/WEB-INF/web.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<web-app xmlns="http://xmlns.jcp.org/xml/ns/javaee"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://xmlns.jcp.org/xml/ns/javaee http://xmlns.jcp.org/xml/ns/javaee/web-app_3_1.xsd"
         version="3.1">
  <error-page>
    <error-code>404</error-code>
    <location>/index.html</location>
  </error-page>
</web-app>
EOF

echo "===== Step 3: Replace app-config.json with deployment API URL ====="
# 可通过环境变量 BACKEND_API_URL 指定后端地址，例如：
#   BACKEND_API_URL=http://8.136.114.162:8080/api ./build.sh
# 未指定时保留占位符，部署前需手动修改 dist/app-config.json
API_URL="${BACKEND_API_URL:-http://REPLACE_WITH_BACKEND_IP:8080/api}"
cat > dist/app-config.json << EOF
{
  "apiBaseUrl": "${API_URL}"
}
EOF

echo "===== Step 4: Ensure Backend does NOT embed Frontend static files ====="
# 前后端分离部署：前端由 Tomcat 托管，后端 jar 只提供 API
mkdir -p backend/src/main/resources/static
rm -rf backend/src/main/resources/static/*

echo "===== Step 5: Build Backend ====="
cd backend
mvn clean package -DskipTests
cd ..

echo "===== Step 6: Assemble deploy-package ====="
rm -rf deploy-package
mkdir -p deploy-package/config deploy-package/data
cp backend/target/intelligent-hr-backend-1.0.0.jar deploy-package/
# 生产部署时保留现有 hr.db 和 weekly-reports.json，包内不再携带
if [ -f backend/data/suggestions.json ]; then
  cp backend/data/suggestions.json deploy-package/data/
fi
cp -r dist deploy-package/
cp deploy-config/config/application.yml deploy-package/config/application.yml
cp deploy-config/start.sh deploy-package/start.sh
cp deploy-config/stop.sh deploy-package/stop.sh
chmod +x deploy-package/start.sh deploy-package/stop.sh
cp docs/project-docs/DEPLOY.md deploy-package/

echo "===== Step 7: Package deploy-package.zip ====="
rm -f deploy-package.zip
zip -r deploy-package.zip deploy-package/

echo "===== Build Complete ====="
echo "Frontend (Tomcat): deploy-package/dist/"
echo "Backend (Java jar): deploy-package/intelligent-hr-backend-1.0.0.jar"
echo "External config:    deploy-package/config/application.yml"
echo "Start script:       deploy-package/start.sh"
echo "Deploy Package:     deploy-package.zip"
