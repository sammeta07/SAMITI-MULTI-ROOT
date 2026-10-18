import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TodoItem, TodoParentType, TodoStatus } from '../models/todo.models';

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

@Injectable({
  providedIn: 'root'
})
export class TodoChecklistService {
  private readonly http = inject(HttpClient);
  private readonly graphqlUrl = environment.graphqlUrl;

  public create(parentType: TodoParentType, parentId: number, title: string): Observable<TodoItem> {
    const mutation = `mutation CreateTodo($input: CreateTodoInput!) {
      createTodo(input: $input) {
        id
        title
        status
        isCompleted
        assignedUserId
        assignedUserName
        createdAt
      }
    }`;

    return this.http.post<GraphqlResponse<{ createTodo: TodoItem }>>(
      this.graphqlUrl,
      { query: mutation, variables: { input: { parentType, parentId, title } } },
      { withCredentials: true }
    ).pipe(map((response) => this.extract(response, 'createTodo')));
  }

  public setCompleted(todoId: number, isCompleted: boolean): Observable<TodoItem> {
    const mutation = `mutation SetTodoCompleted($todoId: Int!, $isCompleted: Boolean!) {
      setTodoCompleted(todoId: $todoId, isCompleted: $isCompleted) {
        id
        title
        status
        isCompleted
        assignedUserId
        assignedUserName
        createdAt
      }
    }`;

    return this.http.post<GraphqlResponse<{ setTodoCompleted: TodoItem }>>(
      this.graphqlUrl,
      { query: mutation, variables: { todoId, isCompleted } },
      { withCredentials: true }
    ).pipe(map((response) => this.extract(response, 'setTodoCompleted')));
  }

  public updateTitle(todoId: number, title: string): Observable<TodoItem> {
    const mutation = `mutation UpdateTodoTitle($todoId: Int!, $title: String!) {
      updateTodoTitle(todoId: $todoId, title: $title) {
        id
        title
        status
        isCompleted
        assignedUserId
        assignedUserName
        createdAt
      }
    }`;

    return this.http.post<GraphqlResponse<{ updateTodoTitle: TodoItem }>>(
      this.graphqlUrl,
      { query: mutation, variables: { todoId, title } },
      { withCredentials: true }
    ).pipe(map((response) => this.extract(response, 'updateTodoTitle')));
  }

  public setStatus(todoId: number, status: TodoStatus): Observable<TodoItem> {
    const mutation = `mutation SetTodoStatus($todoId: Int!, $status: TodoStatus!) {
      setTodoStatus(todoId: $todoId, status: $status) {
        id
        title
        status
        isCompleted
        assignedUserId
        assignedUserName
        createdAt
      }
    }`;

    return this.http.post<GraphqlResponse<{ setTodoStatus: TodoItem }>>(
      this.graphqlUrl,
      { query: mutation, variables: { todoId, status } },
      { withCredentials: true }
    ).pipe(map((response) => this.extract(response, 'setTodoStatus')));
  }

  public assign(todoId: number, ownerUserId: number | null): Observable<TodoItem> {
    const mutation = `mutation AssignTodo($todoId: Int!, $ownerUserId: Int) {
      assignTodo(todoId: $todoId, ownerUserId: $ownerUserId) {
        id
        title
        status
        isCompleted
        assignedUserId
        assignedUserName
        createdAt
      }
    }`;

    return this.http.post<GraphqlResponse<{ assignTodo: TodoItem }>>(
      this.graphqlUrl,
      { query: mutation, variables: { todoId, ownerUserId } },
      { withCredentials: true }
    ).pipe(map((response) => this.extract(response, 'assignTodo')));
  }

  public delete(todoId: number): Observable<boolean> {
    const mutation = `mutation DeleteTodo($todoId: Int!) {
      deleteTodo(todoId: $todoId)
    }`;

    return this.http.post<GraphqlResponse<{ deleteTodo: boolean }>>(
      this.graphqlUrl,
      { query: mutation, variables: { todoId } },
      { withCredentials: true }
    ).pipe(map((response) => this.extract(response, 'deleteTodo')));
  }

  private extract<K extends string, T>(
    response: GraphqlResponse<Record<K, T>>,
    field: K
  ): T {
    if (response.errors?.length) {
      throw new Error(response.errors.map((error) => error.message).join('; '));
    }

    const value = response.data?.[field];
    if (value === undefined || value === null) {
      throw new Error(`GraphQL response is missing ${field}`);
    }
    return value;
  }
}
