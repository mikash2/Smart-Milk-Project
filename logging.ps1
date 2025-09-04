#logs for weight service
kubectl logs -f deployment/smart-milk-weight-service 
#listen to the data that gets to the mosquitto broker topic "milk/weight"
kubectl exec -it deployment/smart-milk-mosquitto -- mosquitto_sub -h localhost -t "milk/weight" -v 

#stop the weight service
kubectl scale deployment smart-milk-weight-service --replicas=0

#start the weight service
kubectl scale deployment smart-milk-weight-service --replicas=1

#listen to the data that gets to the mosquitto broker topic "milk/weight"
kubectl exec -it deployment/smart-milk-mosquitto -- mosquitto_sub -h localhost -t "milk/weight" -v 

#logs for weight service
kubectl logs -f deployment/smart-milk-weight-service 

#logs for the analysis service  
kubectl logs -f deployment/smart-milk-analysis-service 

#logs for the updates service
kubectl logs -f deployment/smart-milk-updates-service 

#logs for the users service
kubectl logs -f deployment/smart-milk-users-service 

#logs for the myapp service
kubectl logs -f deployment/smart-milk-myapp 

