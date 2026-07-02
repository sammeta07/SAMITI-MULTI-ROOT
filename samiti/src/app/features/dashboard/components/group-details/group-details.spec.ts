import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GroupDetails } from './group-details';

describe('GroupDetails', () => {
  let component: GroupDetails;
  let fixture: ComponentFixture<GroupDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GroupDetails],
    }).compileComponents();

    fixture = TestBed.createComponent(GroupDetails);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
