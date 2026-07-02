import { Injectable } from '@angular/core';
import { AppModel } from './app.model';

@Injectable({
  providedIn: 'root'
})
export class AppService {
  private appModel: AppModel = {
    title: 'samiti'
  };

  getAppModel(): AppModel {
    return this.appModel;
  }

  setTitle(title: string): void {
    this.appModel = { title };
  }
}
