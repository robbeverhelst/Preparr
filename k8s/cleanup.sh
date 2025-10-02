#!/bin/bash

echo "Cleaning up preparr-test namespace..."

# Delete all resources in the namespace
kubectl delete namespace preparr-test

echo "Cleanup complete!"