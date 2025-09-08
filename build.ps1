# Smart Milk Project - Docker Build, Tag, Push and Deploy Script (PowerShell)

$VERSION_WEIGHT_SERVICE = "v1.9"
$VERSION_ANALYSIS_SERVICE = "v1.3"
$VERSION_UPDATES_SERVICE = "v2.0"
$VERSION_USERS_SERVICE = "v1.4"
$VERSION_MYAPP = "v1.8"

$VERSION = "v1.2"
$DOCKER_REPO = "mika66"

Write-Host "Building Smart Milk Docker images with version $VERSION..." -ForegroundColor Green

# Build frontend first
Write-Host "Building frontend..." -ForegroundColor Yellow
cd myapp 
npm run build 
cd ..

# Build all services with version tags only
Write-Host "Building Docker images..." -ForegroundColor Yellow
docker build --no-cache -t mika66/smart-milk-weight-service:v1.9 ./weight-service
docker build --no-cache -t mika66/smart-milk-analysis-service:v1.4 ./analysis-service
docker build --no-cache -t mika66/smart-milk-updates-service:v2.8 ./updates-service
docker build --no-cache -t mika66/smart-milk-users-service:v1.4 ./users-service
docker build --no-cache -t mika66/smart-milk-myapp:v1.8 ./myapp


Write-Host "All images built successfully!" -ForegroundColor Green

# Push to Docker Hub (only v1.1 tags)
Write-Host "Pushing v1.1 images to Docker Hub..." -ForegroundColor Yellow
docker push mika66/smart-milk-weight-service:v1.9
docker push mika66/smart-milk-analysis-service:v1.4
docker push mika66/smart-milk-updates-service:v2.8
docker push mika66/smart-milk-users-service:v1.4
docker push mika66/smart-milk-myapp:v1.8


# Apply deployment and perform rollout
Write-Host "Applying Kubernetes deployment..." -ForegroundColor Yellow
kubectl apply -f SmartMilk-deployment.yaml

Write-Host "Performing rolling restart of deployments..." -ForegroundColor Yellow
kubectl rollout restart deployment/smart-milk-weight-service
kubectl rollout restart deployment/smart-milk-analysis-service
kubectl rollout restart deployment/smart-milk-updates-service
kubectl rollout restart deployment/smart-milk-users-service
kubectl rollout restart deployment/smart-milk-myapp

Write-Host "Waiting for rollouts to complete..." -ForegroundColor Yellow
kubectl rollout status deployment/smart-milk-weight-service
kubectl rollout status deployment/smart-milk-analysis-service
kubectl rollout status deployment/smart-milk-updates-service
kubectl rollout status deployment/smart-milk-users-service
kubectl rollout status deployment/smart-milk-myapp

kubectl port-forward service/smart-milk-mysql-external 3307:3306 
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host "You can check the status with: kubectl get pods" -ForegroundColor Cyan
Write-Host "To access the application: kubectl port-forward service/smart-milk-myapp-external 3000:3000" -ForegroundColor Cyan